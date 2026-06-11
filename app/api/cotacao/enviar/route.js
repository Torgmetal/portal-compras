import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { calcularAbatimentoEstoque } from "@/lib/cotacao-estoque";
import { mapearFDPorRM, itemEhFD } from "@/lib/faturamento-direto";

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

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode enviar cotação." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
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

  let cotacoesCriadas = [];
  await prisma.$transaction(async (tx) => {
    // Cria todas as cotações (uma por fornecedor) em paralelo
    cotacoesCriadas = await Promise.all(body.fornecedores.map(async (f) => {
      const token = randomUUID();
      const cot = await tx.cotacao.create({
        data: {
          rmId: rmPrincipal.id,
          fornecedorId: f.fornecedorId || null,
          fornecedorNome: f.nome.trim().toUpperCase(),
          fornecedorEmail: f.email,
          cnpj: f.cnpj || null,
          nCodOmie: f.nCodOmie || null,
          faturamento,
          prazoResposta: prazo,
          observacao: body.observacaoExtra || null,
          token,
          status: "PENDENTE",
          itens: {
            create: itensCotaveis.map((it) => {
              const peso = Number(it.peso) || 0;
              const ab = estoque.porItem.get(it.id);
              // Sem resposta de estoque: cota a quantidade cheia (peso em KG p/ aço).
              if (!ab || ab.barrasDisponiveis <= 0) {
                return { rmItemId: it.id, precoUnit: 0, qtdCotada: peso > 0 ? peso : it.qtd };
              }
              return {
                rmItemId: it.id,
                precoUnit: 0,
                qtdCotada: ab.qtdCotada,
                qtdPecasCotada: ab.barrasACotar,
                estoqueAbatidoQtd: ab.barrasDisponiveis,
              };
            }),
          },
        },
      });
      // Registra envio nas RMs que de fato têm itens na cotação (paralelo por RM)
      await Promise.all(rmsEnvolvidas.map((rm) =>
        tx.envio.create({
          data: { rmId: rm.id, fornecedorNome: f.nome.trim().toUpperCase(), fornecedorEmail: f.email },
        })
      ));
      return {
        id: cot.id,
        token: cot.token,
        fornecedorNome: f.nome.trim().toUpperCase(),
        fornecedorEmail: f.email,
        rmsVinculadas: rmsEnvolvidas.map((r) => r.numero),
      };
    }));

    // Marca itens PENDENTES como EM_COTACAO
    await tx.rMItem.updateMany({
      where: {
        id: { in: itensCotaveis.map((i) => i.id) },
        status: "PENDENTE",
      },
      data: { status: "EM_COTACAO" },
    });

    // Atualiza status das RMs que estavam ABERTA para EM_COTACAO (batch)
    const rmIdsAberta = rmsEnvolvidas.filter((rm) => rm.status === "ABERTA").map((rm) => rm.id);
    if (rmIdsAberta.length > 0) {
      await tx.rM.updateMany({
        where: { id: { in: rmIdsAberta } },
        data: { status: "EM_COTACAO" },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "enviar_cotacao",
        entity: "RM",
        entityId: rmPrincipal.id,
        diff: {
          rmsVinculadas: rmsEnvolvidas.map((r) => r.numero),
          fornecedores: body.fornecedores.length,
          itens: itensCotaveis.length,
          prazo: body.prazoResposta || null,
          estoqueAbatidos: estoque.abatidos.length || undefined,
          estoqueExcluidos: estoque.excluidos.length || undefined,
        },
      },
    });
  });

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
