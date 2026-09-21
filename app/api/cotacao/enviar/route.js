import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { calcularAbatimentoEstoque } from "@/lib/cotacao-estoque";
import { mapearFDPorRM, itemEhFD } from "@/lib/faturamento-direto";
import { aquecerBanco, withDbRetry } from "@/lib/db-retry";
import { gravarCotacoes, OPCOES_TX } from "@/lib/cotacao-envio-gravacao";
import { log } from "@/lib/log";

const registro = log("api/cotacao/enviar");

// ⚠ 7 fornecedores × 9 itens da T122-001 levaram a transação além dos 10 s padrão da função
// somados aos e-mails (21/09/2026). A gravação agora é em lote, mas o e-mail continua um por
// fornecedor, e o Resend não tem pressa.
export const maxDuration = 60;

const fornecedorSchema = z.object({
  fornecedorId: z.string().optional().nullable(), // ID do cadastro unificado
  nome: z.string().min(1),
  email: z.string().email(),
  cnpj: z.string().optional().nullable(),
  nCodOmie: z.string().optional().nullable(),
});

// Aceita 1 ou mais RMs (consolida itens de várias RMs num envio só pro fornecedor).
const schema = z.object({
  // Pode vir só rmId (legado) ou rmIds (multi-RM)
  rmId: z.string().optional(),
  rmIds: z.array(z.string()).optional(),
  itensIds: z.array(z.string()).min(1),
  fornecedores: z.array(fornecedorSchema).min(1),
  prazoResposta: z.string().optional().nullable(),
  observacaoExtra: z.string().optional().nullable(),
});

// ⚠ `e.message` do Zod é o despejo JSON de todos os issues — foi o que o comprador leu quando um
// cadastro do Omie veio com dois e-mails no mesmo campo ("a@x.com,b@y.com", 21/09/2026). Quem lê
// isto está no modal, com a lista na frente: a mensagem tem que dizer QUAL fornecedor e o quê.
function mensagemDeValidacao(e, bruto) {
  const issue = e?.issues?.[0];
  if (!issue) return "Dados inválidos: " + (e?.message || "corpo da requisição não é JSON");
  const [campo, indice] = issue.path || [];
  if (campo === "fornecedores" && Number.isInteger(indice)) {
    const f = bruto?.fornecedores?.[indice];
    const nome = f?.nome ? ` "${f.nome}"` : ` nº ${indice + 1}`;
    if (issue.path[2] === "email") {
      return `E-mail inválido no fornecedor${nome}: "${f?.email ?? ""}". Corrija o e-mail no cadastro (ou digite o fornecedor como avulso).`;
    }
    return `Fornecedor${nome}: ${issue.path[2] || "dados"} — ${issue.message}`;
  }
  return `Dados inválidos em ${issue.path?.join(".") || "?"}: ${issue.message}`;
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode enviar cotação." }, { status: 403 });
  }

  let body;
  let bruto;
  try {
    bruto = await req.json();
    body = schema.parse(bruto);
  } catch (e) {
    return NextResponse.json({ error: mensagemDeValidacao(e, bruto) }, { status: 400 });
  }

  // Normaliza rmIds: aceita rmIds[] OU rmId único
  const rmIds = body.rmIds && body.rmIds.length > 0
    ? body.rmIds
    : (body.rmId ? [body.rmId] : []);
  if (rmIds.length === 0) {
    return NextResponse.json({ error: "Informe ao menos uma RM (rmId ou rmIds)." }, { status: 400 });
  }

  // Busca todas as RMs envolvidas (com vinculo OPItem/AditivoItem pra derivar faturamento)
  const rms = await prisma.rM.findMany({
    where: { id: { in: rmIds } },
    include: {
      itens: {
        include: {
          opItem: { select: { faturamentoDireto: true } },
          aditivoItem: { select: { faturamentoDireto: true } },
        },
      },
    },
  });
  if (rms.length === 0) return NextResponse.json({ error: "RM(s) não encontrada(s)." }, { status: 404 });
  if (rms.length !== rmIds.length) {
    return NextResponse.json({ error: "Alguma RM não foi encontrada." }, { status: 404 });
  }

  // ALUGUEL e MONTAGEM não passam por cotação — o pedido Omie sai direto
  const rmSemCotacao = rms.find((r) => ["ALUGUEL", "MONTAGEM"].includes(r.tipoRM));
  if (rmSemCotacao) {
    return NextResponse.json(
      { error: `RM ${rmSemCotacao.numero} é de ${rmSemCotacao.tipoRM === "ALUGUEL" ? "aluguel" : "montagem"} — não passa por cotação. Gere o pedido Omie direto na tela da RM.` },
      { status: 400 }
    );
  }

  // Coleta todos os itens das RMs e filtra os selecionados
  const todosItens = rms.flatMap((r) => r.itens);
  const itensValidos = todosItens.filter((it) => body.itensIds.includes(it.id));
  if (itensValidos.length === 0) {
    return NextResponse.json({ error: "Nenhum item válido pra cotar." }, { status: 400 });
  }

  let itensCotaveis = itensValidos.filter(
    (it) => it.status === "PENDENTE" || it.status === "EM_COTACAO" || it.status === "COTADO"
  );
  if (itensCotaveis.length === 0) {
    return NextResponse.json(
      { error: "Itens selecionados já viraram pedido ou foram cancelados — não dá pra cotar de novo." },
      { status: 409 }
    );
  }

  // Abate o que a Produção respondeu ter em estoque (consulta em barras):
  // itens 100% disponíveis saem da cotação; parciais vão com o saldo a comprar.
  const estoque = await calcularAbatimentoEstoque(itensCotaveis);
  itensCotaveis = itensCotaveis.filter((it) => (estoque.porItem.get(it.id)?.barrasACotar ?? 1) > 0);
  if (itensCotaveis.length === 0) {
    return NextResponse.json(
      { error: "Todos os itens selecionados estão disponíveis em estoque segundo a consulta respondida — nada a cotar. Use \"Atender estoque\" nos itens para finalizá-los." },
      { status: 409 }
    );
  }

  const prazo = body.prazoResposta ? new Date(body.prazoResposta) : null;
  if (prazo && Number.isNaN(prazo.getTime())) {
    // ⚠ Data inválida entregue ao Prisma vira exceção solta → 500 sem explicação na tela.
    return NextResponse.json({ error: `Prazo de resposta inválido: "${body.prazoResposta}".` }, { status: 400 });
  }

  // Só as RMs que ainda têm item na cotação após o abatimento: uma RM cujos
  // itens foram todos cobertos pelo estoque não pode virar EM_COTACAO, nem
  // ganhar registro de Envio, nem ser a RM principal.
  const rmIdsComItem = new Set(itensCotaveis.map((it) => it.rmId));
  const rmsEnvolvidas = rms.filter((r) => rmIdsComItem.has(r.id));

  // RM principal (1ª da lista COM itens — a Cotacao guarda só uma referência
  // direta de RM, as demais ficam vinculadas via os CotacaoItens).
  const rmPrincipal = rmsEnvolvidas.find((r) => r.id === rmIds.find((id) => rmIdsComItem.has(id))) || rmsEnvolvidas[0];

  // Deriva faturamento: se ALGUM item cotável é faturamento direto, marca "Cliente".
  // Como o vínculo RMItem→OPItem raramente existe (a engenharia aponta só a OP),
  // usa o fallback por categoria da RM (mesma lógica do painel de OPs).
  const fdPorRM = await mapearFDPorRM(itensCotaveis.map((it) => it.rmId));
  const algumFD = itensCotaveis.some((it) => itemEhFD(it, fdPorRM));
  const faturamento = algumFD ? "Cliente" : "Torg";

  // ⚠⚠ O NEON SOME POR ALGUNS SEGUNDOS (P1001 "Can't reach database server") — apareceu no log
  // de produção no mesmo horário do 500 da T122-001 (21/09/2026 09:59). `aquecerBanco` acorda a
  // compute antes da transação; `withDbRetry` repete a transação INTEIRA se o blip vier no meio —
  // é seguro porque a anterior foi desfeita por completo (nada commitado, nenhum e-mail enviado).
  // Qualquer outro erro vira 500 em JSON com a causa: a tela mostra, a pessoa relata.
  let cotacoesCriadas;
  try {
    await aquecerBanco(prisma, { tentativas: 3, esperaMs: 1500 });
    cotacoesCriadas = await withDbRetry(
      () => prisma.$transaction(
        (tx) => gravarCotacoes(tx, {
          fornecedores: body.fornecedores,
          itensCotaveis,
          rmsEnvolvidas,
          rmPrincipal,
          faturamento,
          prazo,
          observacao: body.observacaoExtra,
          estoque,
          user,
          prazoTexto: body.prazoResposta,
        }),
        OPCOES_TX
      ),
      { tentativas: 2, esperaMs: 1500 }
    );
  } catch (e) {
    registro.erro("[enviar] falha ao gravar cotações:", e?.message);
    const causa = String(e?.message || e || "erro desconhecido").split("\n").filter(Boolean).pop().slice(0, 300);
    return NextResponse.json(
      { ok: false, error: `Não consegui gravar a cotação (nada foi enviado): ${causa}. Tente de novo em alguns segundos; se repetir, avise o suporte com esta mensagem.` },
      { status: 500 }
    );
  }

  // --- Envio automático de emails via Resend (best-effort, não bloqueia) ---
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL || "workspace.torg.com.br"}`;
  const numerosRMs = rmsEnvolvidas.map((r) => r.numero).filter(Boolean);
  const rotuloRMs = numerosRMs.length === 1
    ? `RM ${numerosRMs[0]}`
    : `RMs ${numerosRMs.join(", ")}`;
  const totalItens = itensCotaveis.length;
  const prazoTxt = prazo ? prazo.toLocaleDateString("pt-BR") : null;
  const obsTexto = body.observacaoExtra?.trim() || null;
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const emailResults = [];
  await Promise.all(cotacoesCriadas.map(async (cot) => {
    if (!cot.fornecedorEmail) return;
    const link = `${baseUrl}/fornecedores/c/${cot.token}`;
    const subject = `Solicitacao de Cotacao — ${rotuloRMs} (Torg Metal)`;

    const html = `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 620px; margin: 0 auto; color: #2d3748;">
        <h2 style="color: #006EAB; margin-top: 0;">Solicitação de Cotação</h2>
        <p style="color: #4a5568; line-height: 1.6;">
          Prezado(a) <strong>${esc(cot.fornecedorNome)}</strong>,
        </p>
        <p style="color: #4a5568; line-height: 1.6;">
          Estamos solicitando sua cotação para o material listado na <strong>${esc(rotuloRMs)}</strong>.
          Acesse o link abaixo para ver os itens e enviar sua proposta. O link é <strong>único e privado</strong> —
          não precisa de login.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${link}"
             style="background: #006EAB; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
            Abrir cotação
          </a>
        </div>
        <p style="color: #718096; font-size: 13px; line-height: 1.5;">
          Ou copie e cole esse endereço no navegador:<br>
          <span style="color: #006EAB; word-break: break-all;">${link}</span>
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #718096;">Total de itens</td><td style="padding: 6px 0;"><strong>${totalItens}</strong></td></tr>
          ${prazoTxt ? `<tr><td style="padding: 6px 0; color: #718096;">Prazo de resposta</td><td style="padding: 6px 0;"><strong>${prazoTxt}</strong></td></tr>` : ""}
          ${obsTexto ? `<tr><td style="padding: 6px 0; color: #718096; vertical-align: top;">Observação</td><td style="padding: 6px 0;">${esc(obsTexto)}</td></tr>` : ""}
        </table>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="color: #a0aec0; font-size: 12px; line-height: 1.4;">
          Atenciosamente,<br>
          <strong>Equipe de Compras — Torg Metal</strong>
        </p>
      </div>
    `;

    const text = [
      `Prezado(a) ${cot.fornecedorNome},`,
      "",
      `Solicitamos cotação para o material da ${rotuloRMs}.`,
      "Acesse o link abaixo (único e privado) para enviar sua proposta:",
      "",
      link,
      "",
      `Itens: ${totalItens}`,
      prazoTxt ? `Prazo: ${prazoTxt}` : null,
      obsTexto ? `Observação: ${obsTexto}` : null,
      "",
      "Atenciosamente,",
      "Equipe de Compras — Torg Metal",
    ].filter(Boolean).join("\n");

    try {
      const result = await sendEmail({
        to: cot.fornecedorEmail,
        cc: user.email,
        subject,
        html,
        text,
        replyTo: user.email,
      });
      emailResults.push({ fornecedor: cot.fornecedorNome, email: cot.fornecedorEmail, ok: result.ok, error: result.error || null });

      if (result.ok) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "email_cotacao_automatico",
            entity: "Cotacao",
            entityId: cot.id,
            diff: { email: cot.fornecedorEmail, cc: user.email, resendId: result.id },
          },
        });
      }
    } catch (e) {
      emailResults.push({ fornecedor: cot.fornecedorNome, email: cot.fornecedorEmail, ok: false, error: e.message });
    }
  }));

  return NextResponse.json({
    ok: true,
    cotacoes: cotacoesCriadas,
    emails: emailResults,
    // Resumo do abatimento por estoque (para a UI avisar o comprador).
    estoque: (estoque.abatidos.length || estoque.excluidos.length)
      ? { abatidos: estoque.abatidos, excluidos: estoque.excluidos }
      : null,
  });
}
