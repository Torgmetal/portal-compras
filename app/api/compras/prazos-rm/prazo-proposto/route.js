// POST /api/compras/prazos-rm/prazo-proposto — Compras aprova ou recusa a data que o fornecedor
// propôs pelo link público.
//
// ⚠⚠ ESTE É O ÚNICO LUGAR QUE TRANSFORMA PROPOSTA EM PRAZO. A rota pública
// (`/api/fornecedores/entrega/[token]`) só grava `prazoProposto*`; nada lá escreve
// `prazoEntregaPrevisto` nem cria `PrazoHistorico`. Matheus (18/09/2026): "sim, o Compras precisa
// aprovar a alteração depois".
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escaparHtml as esc } from "@/lib/email-layout";
import { emailDoPedido } from "@/lib/cobranca-atraso";
import {
  MARCA_FORNECEDOR, LIMPAR_PROPOSTA, propostaPendente, prazoEfetivo, textoDaRecusa,
} from "@/lib/prazo-proposto";
import { log } from "@/lib/log";

const registro = log("prazo-proposto");

const schema = z.object({
  pedidoId: z.string().min(1, "pedidoId obrigatorio"),
  // ⚠⚠ A TELA DEVOLVE O ID DA PROPOSTA QUE ELA LEU (achado do Codex). Sem ele, aprovar é "aceite
  // o que estiver lá agora" — e o fornecedor pode ter trocado a data entre a tela carregar e o
  // clique. Divergiu, é 409 e a tela recarrega; ninguém aprova uma data que não leu.
  propostaId: z.string().min(1, "propostaId obrigatorio"),
  acao: z.enum(["aprovar", "recusar"]),
  motivo: z.string().max(500).optional(),
});

/** Tudo que `previsaoAtual` precisa para saber qual prazo vale hoje. */
const SELECT_PEDIDO = {
  id: true, numeroPedido: true, codigoPedido: true, createdAt: true,
  fornecedorNome: true, dataEntregaReal: true,
  prazoEntregaPrevisto: true, prazoOriginal: true,
  prazoProposto: true, prazoPropostoEm: true, prazoPropostoMotivo: true, prazoPropostoId: true,
  prazoHistorico: { select: { prazoNovo: true, criadoEm: true }, orderBy: { criadoEm: "asc" } },
  cotacao: {
    select: {
      observacao: true, fornecedorEmail: true,
      fornecedor: { select: { email: true } },
      itens: { where: { vencedor: true }, select: { vencedor: true, prazoEntrega: true } },
    },
  },
  rmItens: { select: { rm: { select: { numero: true } } }, take: 1 },
};

const erro = (msg, status) => NextResponse.json({ success: false, error: msg }, { status });

/** Aprova: a data do fornecedor passa a valer, e só aqui. */
async function aprovar(pedido, proposta, user) {
  // ⚠⚠ `prazoOriginal` VEM DA PREVISÃO EFETIVA, não da coluna crua (achado do Codex): há pedido
  // cuja previsão vem dos itens da cotação ou do prazo escrito em palavras, com
  // `prazoEntregaPrevisto` nulo. Gravando a coluna, esses registrariam original NULO e a cobrança
  // perderia a referência do que foi combinado.
  const anterior = prazoEfetivo(pedido);

  return prisma.$transaction(async (tx) => {
    // ⚠⚠ A TROCA É CONDICIONADA AO ID DA PROPOSTA, no próprio UPDATE. Ler e depois gravar deixaria
    // passar a proposta que mudou no meio — e o `PrazoHistorico` registraria uma data que ninguém
    // aprovou. `count === 0` é 409, não erro genérico.
    const r = await tx.pedidoOmie.updateMany({
      where: { id: pedido.id, prazoPropostoId: proposta.id, dataEntregaReal: null },
      data: {
        prazoEntregaPrevisto: proposta.prazo,
        ...(pedido.prazoOriginal || !anterior ? {} : { prazoOriginal: anterior }),
        ...LIMPAR_PROPOSTA,
      },
    });
    if (r.count === 0) return { conflito: true };

    await tx.prazoHistorico.create({
      data: {
        pedidoId: pedido.id, prazoAnterior: anterior, prazoNovo: proposta.prazo,
        // ⚠ O texto guarda o PREFIXO e o que o FORNECEDOR escreveu — nada do comentário interno de
        // quem aprovou. O GET público filtra o histórico por esse prefixo, e um texto interno
        // colado aqui vazaria pelo link. Quem aprovou fica em `alteradoPorId`.
        motivo: proposta.motivo
          ? `${MARCA_FORNECEDOR} ${proposta.motivo}`
          : `${MARCA_FORNECEDOR} Previsao informada via portal`,
        alteradoPorId: user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id, action: "APROVAR_PRAZO_PROPOSTO", entity: "PedidoOmie", entityId: pedido.id,
        diff: {
          prazoAnterior: anterior?.toISOString() || null,
          prazoNovo: new Date(proposta.prazo).toISOString(),
          propostaId: proposta.id,
          motivoDoFornecedor: proposta.motivo || null,
        },
      },
    });
    return { conflito: false, prazoAnterior: anterior, prazoNovo: proposta.prazo };
  });
}

/** Recusa: a proposta some, o prazo continua o que era, e o fornecedor fica sabendo. */
async function recusar(pedido, proposta, user, motivo) {
  const r = await prisma.$transaction(async (tx) => {
    const u = await tx.pedidoOmie.updateMany({
      where: { id: pedido.id, prazoPropostoId: proposta.id },
      data: LIMPAR_PROPOSTA,
    });
    if (u.count === 0) return { conflito: true };

    await tx.auditLog.create({
      data: {
        userId: user.id, action: "RECUSAR_PRAZO_PROPOSTO", entity: "PedidoOmie", entityId: pedido.id,
        diff: {
          prazoRecusado: new Date(proposta.prazo).toISOString(),
          prazoMantido: pedido.prazoEntregaPrevisto?.toISOString() || null,
          propostaId: proposta.id, motivo: motivo || null,
        },
      },
    });
    return { conflito: false };
  });
  if (r.conflito) return r;

  // ⚠⚠ AVISAR O FORNECEDOR É PARTE DA RECUSA (achado do Codex). Sem o aviso ele respondeu, viu
  // "recebido" na tela e segue achando que a data nova está combinada — a Torg programa o pátio
  // para uma data e ele carrega para outra.
  //
  // ⚠ Mas o aviso NUNCA derruba a recusa: ela já está gravada. Se o e-mail falhar, a tela diz que
  // falhou e quem recusou liga — refazer a recusa não traria o e-mail de volta.
  const para = emailDoPedido(pedido);
  let avisoOk = false;
  if (para) {
    const t = textoDaRecusa(
      { numeroPedido: pedido.numeroPedido, rmNumero: pedido.rmItens?.[0]?.rm?.numero || null },
      proposta, motivo,
    );
    const r2 = await sendEmail({
      to: para, replyTo: "compras@torg.com.br", subject: t.assunto,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;color:#18394f;">
        <p style="font-size:14px;line-height:1.8;margin:0 0 12px;">${esc(t.linha)}</p>
        ${t.motivo ? `<p style="font-size:13px;line-height:1.8;margin:0 0 12px;padding:12px 14px;background:#f4f8fb;border-left:3px solid #F4801F;">${esc(t.motivo)}</p>` : ""}
        <p style="font-size:14px;line-height:1.8;margin:0;">${esc(t.pedido)}</p>
        <p style="font-size:13px;color:#5d7b8d;margin:18px 0 0;">Compras · Torg Metal</p>
      </div>`,
      text: `${t.linha}\n\n${t.motivo ? t.motivo + "\n\n" : ""}${t.pedido}\n\nCompras · Torg Metal`,
    }).catch((e) => ({ ok: false, error: e?.message }));
    avisoOk = !!r2?.ok;
  }
  if (!avisoOk) registro.aviso(`[${pedido.numeroPedido}] recusa gravada, fornecedor NÃO avisado`);
  return { conflito: false, avisoOk, semEmail: !para };
}

/** O que impede decidir esta proposta agora. `null` = pode seguir. */
function oQueImpede(pedido, proposta, body) {
  if (!pedido) return { msg: "Pedido nao encontrado", status: 404 };
  if (!proposta) return { msg: "Nao ha proposta pendente neste pedido. Recarregue a tela.", status: 409 };
  if (proposta.id !== body.propostaId) {
    return { msg: "O fornecedor mudou a proposta depois que a tela carregou. Recarregue para ver a atual.", status: 409 };
  }
  if (body.acao === "aprovar" && pedido.dataEntregaReal) {
    return { msg: "Este pedido ja foi entregue.", status: 400 };
  }
  return null;
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    return erro(e.message, e.message === "Unauthorized" ? 401 : 403);
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return erro("Dados invalidos: " + (e.issues?.[0]?.message || e.message), 400);
  }

  const pedido = await prisma.pedidoOmie.findUnique({
    where: { id: body.pedidoId }, select: SELECT_PEDIDO,
  });
  const proposta = propostaPendente(pedido);
  const recusa = oQueImpede(pedido, proposta, body);
  if (recusa) return erro(recusa.msg, recusa.status);

  const r = body.acao === "aprovar"
    ? await aprovar(pedido, proposta, user)
    : await recusar(pedido, proposta, user, body.motivo?.trim() || null);

  if (r.conflito) {
    return erro("A proposta mudou enquanto voce decidia. Recarregue a tela.", 409);
  }

  return NextResponse.json({ success: true, acao: body.acao, ...r });
}
