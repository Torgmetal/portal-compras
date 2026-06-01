// POST /api/compras/entregas/cobrar — envia email de cobranca ao fornecedor
// de um pedido com entrega atrasada. Lista os itens pendentes (descontando
// recebimentos parciais por rmItemId), prazo original e dias de atraso.
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const schema = z.object({
  pedidoId: z.string().min(1, "pedidoId obrigatorio"),
});

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function fmtQtd(qtd, unidade) {
  if (qtd == null) return "—";
  const dec = unidade === "KG" ? 1 : 0;
  return `${Number(qtd).toFixed(dec)} ${unidade || ""}`.trim();
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Dados invalidos: " + (e.issues?.[0]?.message || e.message) },
      { status: 400 }
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Servico de email nao configurado. Peca pro admin setar RESEND_API_KEY no Vercel." },
      { status: 503 }
    );
  }

  // ── Buscar pedido com itens + recebimentos por item ──
  const pedido = await prisma.pedidoOmie.findUnique({
    where: { id: body.pedidoId },
    select: {
      id: true,
      numeroPedido: true,
      codigoPedido: true,
      fornecedorNome: true,
      total: true,
      prazoEntregaPrevisto: true,
      tokenEntrega: true,
      opId: true,
      op: { select: { numero: true, cliente: true, obra: true } },
      cotacao: {
        select: {
          id: true,
          fornecedorEmail: true,
          fornecedorNome: true,
          fornecedor: {
            select: { email: true, emailsAdicionais: true, razaoSocial: true },
          },
          rm: {
            select: {
              numero: true,
              op: { select: { numero: true, cliente: true } },
            },
          },
          itens: {
            where: { vencedor: true },
            select: {
              id: true,
              precoUnit: true,
              qtdCotada: true,
              prazoEntrega: true,
              rmItemId: true,
              rmItem: {
                select: {
                  id: true,
                  descricao: true,
                  qtd: true,
                  unidade: true,
                  peso: true,
                  recebimentos: {
                    select: { qtdRecebida: true },
                  },
                },
              },
            },
          },
        },
      },
      rmItens: {
        select: {
          id: true,
          descricao: true,
          qtd: true,
          unidade: true,
          peso: true,
          recebimentos: {
            select: { qtdRecebida: true },
          },
        },
        take: 30,
      },
      recebimentos: {
        select: { qtdRecebida: true, dataRecebimento: true, nfNumero: true },
        orderBy: { dataRecebimento: "desc" },
      },
    },
  });

  if (!pedido) {
    return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
  }

  // ── Resolver email ──
  const emailFornecedor =
    pedido.cotacao?.fornecedor?.email ||
    pedido.cotacao?.fornecedorEmail ||
    null;

  if (!emailFornecedor) {
    return NextResponse.json(
      { error: "Nao ha email cadastrado para esse fornecedor. Verifique o cadastro no Vendor List." },
      { status: 400 }
    );
  }

  const emailsCC = pedido.cotacao?.fornecedor?.emailsAdicionais?.filter(Boolean) || [];

  const numPedido = pedido.numeroPedido || pedido.codigoPedido || "s/n";
  const nomeFornecedor =
    pedido.cotacao?.fornecedor?.razaoSocial ||
    pedido.fornecedorNome ||
    pedido.cotacao?.fornecedorNome ||
    "Fornecedor";

  // ── Gerar/reutilizar token publico ──
  let tokenEntrega = pedido.tokenEntrega;
  if (!tokenEntrega) {
    tokenEntrega = crypto.randomBytes(24).toString("hex");
    await prisma.pedidoOmie.update({
      where: { id: pedido.id },
      data: { tokenEntrega },
    });
  }
  const baseUrl = process.env.NEXTAUTH_URL || `https://${process.env.VERCEL_URL}`;
  const linkEntrega = `${baseUrl}/fornecedores/entrega/${tokenEntrega}`;

  // ── Montar itens com saldo pendente ──
  // Prioriza itens da cotacao (vencedores); fallback pra rmItens diretos
  const itensCotacao = pedido.cotacao?.itens?.map((ci) => {
    const ri = ci.rmItem;
    const qtdOriginal = ri?.peso > 0 ? Number(ri.peso) : (ri?.qtd || 0);
    const unidade = "KG";
    const totalRecebido = (ri?.recebimentos || []).reduce((s, r) => s + (r.qtdRecebida || 0), 0);
    const qtdPendente = Math.max(0, qtdOriginal - totalRecebido);
    return {
      descricao: ri?.descricao || "—",
      qtdOriginal,
      unidade,
      totalRecebido,
      qtdPendente,
    };
  }) || [];

  const itensDiretos = pedido.rmItens?.map((ri) => {
    const qtdOriginal = ri.peso > 0 ? Number(ri.peso) : (ri.qtd || 0);
    const unidade = "KG";
    const totalRecebido = (ri.recebimentos || []).reduce((s, r) => s + (r.qtdRecebida || 0), 0);
    const qtdPendente = Math.max(0, qtdOriginal - totalRecebido);
    return {
      descricao: ri.descricao || "—",
      qtdOriginal,
      unidade,
      totalRecebido,
      qtdPendente,
    };
  }) || [];

  const todosItens = itensCotacao.length > 0 ? itensCotacao : itensDiretos;

  // Separar: pendentes (qtdPendente > 0) e ja entregues
  const itensPendentes = todosItens.filter((it) => it.qtdPendente > 0);
  const temParcial = todosItens.some((it) => it.totalRecebido > 0);

  // ── Dados complementares ──
  // Prazo: usa PedidoOmie.prazoEntregaPrevisto; fallback pro prazo mais tardio
  // dos CotacaoItems vencedores (mesma logica de entregas/route GET)
  let prazo = pedido.prazoEntregaPrevisto;
  if (!prazo && pedido.cotacao?.itens?.length > 0) {
    const prazosItens = pedido.cotacao.itens
      .filter((ci) => ci.prazoEntrega)
      .map((ci) => new Date(ci.prazoEntrega).getTime());
    if (prazosItens.length > 0) {
      prazo = new Date(Math.max(...prazosItens));
    }
  }
  const prazoTxt = fmtData(prazo);
  const diasAtraso = prazo
    ? Math.max(0, Math.ceil((Date.now() - new Date(prazo).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const op = pedido.op || pedido.cotacao?.rm?.op;
  const opLabel = op?.numero ? `OP ${op.numero}${op.cliente ? ` — ${op.cliente}` : ""}` : null;

  const subject = `Acompanhamento de Entrega — Pedido #${numPedido} (Torg Metal)`;

  // ── Email HTML ──
  // Tabela de itens pendentes
  const tabelaItensPendentes = itensPendentes.length > 0
    ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <thead>
          <tr style="background:#f7fafc;">
            <th style="text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0;color:#4a5568;">Item</th>
            <th style="text-align:right;padding:8px 10px;border-bottom:2px solid #e2e8f0;color:#4a5568;width:110px;">Pedido</th>
            ${temParcial ? `<th style="text-align:right;padding:8px 10px;border-bottom:2px solid #e2e8f0;color:#38a169;width:110px;">Recebido</th>` : ""}
            <th style="text-align:right;padding:8px 10px;border-bottom:2px solid #e2e8f0;color:#c53030;width:110px;font-weight:700;">Pendente</th>
          </tr>
        </thead>
        <tbody>
          ${itensPendentes.map((it) => `
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #edf2f7;color:#2d3748;">${esc(it.descricao)}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #edf2f7;color:#718096;text-align:right;">${fmtQtd(it.qtdOriginal, it.unidade)}</td>
              ${temParcial ? `<td style="padding:6px 10px;border-bottom:1px solid #edf2f7;color:#38a169;text-align:right;">${it.totalRecebido > 0 ? fmtQtd(it.totalRecebido, it.unidade) : "—"}</td>` : ""}
              <td style="padding:6px 10px;border-bottom:1px solid #edf2f7;color:#c53030;text-align:right;font-weight:600;">${fmtQtd(it.qtdPendente, it.unidade)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : "";

  // Itens ja totalmente entregues (se houver parcial)
  const itensEntregues = todosItens.filter((it) => it.qtdPendente <= 0 && it.totalRecebido > 0);


  // Texto de intro muda se tem entrega parcial
  const introEntrega = temParcial
    ? `Gostaríamos de verificar o andamento do <strong>Pedido de Compra #${esc(numPedido)}</strong>.
       Identificamos que parte dos itens ja foi entregue, porem
       <strong>${itensPendentes.length} ite${itensPendentes.length !== 1 ? "ns" : "m"}</strong> ainda
       ${itensPendentes.length !== 1 ? "encontram-se" : "encontra-se"} pendente${itensPendentes.length !== 1 ? "s" : ""}
       ${diasAtraso > 0 ? `e o prazo acordado (<strong>${prazoTxt}</strong>) foi ultrapassado em <strong>${diasAtraso} dia${diasAtraso !== 1 ? "s" : ""}</strong>` : `com prazo previsto para <strong>${prazoTxt}</strong>`}.`
    : `Gostaríamos de verificar o andamento do <strong>Pedido de Compra #${esc(numPedido)}</strong>,
       cujo prazo de entrega estava previsto para <strong>${prazoTxt}</strong>${diasAtraso > 0
         ? ` e encontra-se com <strong>${diasAtraso} dia${diasAtraso !== 1 ? "s" : ""}</strong> alem do prazo acordado`
         : ""}.`;

  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;max-width:640px;margin:0 auto;color:#2d3748;">
      <h2 style="color:#006EAB;margin-top:0;">Acompanhamento de Entrega</h2>

      <p style="color:#4a5568;line-height:1.6;">
        Prezado(a) <strong>${esc(nomeFornecedor)}</strong>,
      </p>

      <p style="color:#4a5568;line-height:1.6;">
        ${introEntrega}
      </p>

      <p style="color:#4a5568;line-height:1.6;">
        Pedimos, por gentileza, que nos envie uma <strong>previsao atualizada de entrega</strong>
        ou a confirmacao de despacho dos materiais pendentes para que possamos nos programar internamente.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#718096;width:150px;">Pedido</td><td style="padding:6px 0;"><strong>#${esc(numPedido)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#718096;">Prazo acordado</td><td style="padding:6px 0;"><strong>${prazoTxt}</strong></td></tr>
        ${diasAtraso > 0 ? `<tr><td style="padding:6px 0;color:#718096;">Dias alem do prazo</td><td style="padding:6px 0;"><strong style="color:#c53030;">${diasAtraso}</strong></td></tr>` : ""}
        ${opLabel ? `<tr><td style="padding:6px 0;color:#718096;">Referencia</td><td style="padding:6px 0;">${esc(opLabel)}</td></tr>` : ""}
      </table>

      ${itensPendentes.length > 0
        ? `<p style="color:#4a5568;font-weight:700;margin-bottom:4px;font-size:14px;">
            Itens pendentes de entrega:
          </p>
          ${tabelaItensPendentes}`
        : ""}

      ${itensEntregues.length > 0
        ? `<p style="color:#38a169;font-size:12px;margin-top:16px;">
            ✓ ${itensEntregues.length} ite${itensEntregues.length !== 1 ? "ns ja" : "m ja"} recebido${itensEntregues.length !== 1 ? "s" : ""} — agradecemos o envio.
          </p>`
        : ""}

      <div style="background:#f7fafc;border-radius:8px;padding:16px 20px;margin:24px 0;text-align:center;">
        <p style="color:#4a5568;font-size:13px;margin:0 0 12px 0;">
          Para informar a nova previsao de entrega, clique no botao abaixo:
        </p>
        <a href="${linkEntrega}" target="_blank"
           style="display:inline-block;background:#006EAB;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 28px;border-radius:8px;">
          Informar previsao de entrega
        </a>
        <p style="color:#a0aec0;font-size:11px;margin:10px 0 0 0;">
          Ou copie e cole este link no navegador:<br>
          <a href="${linkEntrega}" style="color:#006EAB;word-break:break-all;">${linkEntrega}</a>
        </p>
      </div>

      <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="color:#4a5568;line-height:1.5;font-size:13px;">
        Voce tambem pode responder este email diretamente com a previsao atualizada.<br>
        Desde ja agradecemos a atencao e parceria.
      </p>
      <p style="color:#a0aec0;font-size:12px;line-height:1.4;">
        Atenciosamente,<br>
        <strong>Equipe de Compras — Torg Metal</strong>
      </p>
    </div>
  `;

  // ── Texto plano ──
  const tl = [
    `Prezado(a) ${nomeFornecedor},`,
    "",
    temParcial
      ? `Gostaríamos de verificar o andamento do Pedido #${numPedido}. Parte dos itens ja foi entregue, porem ${itensPendentes.length} ite${itensPendentes.length !== 1 ? "ns" : "m"} encontra${itensPendentes.length !== 1 ? "m" : ""}-se pendente${itensPendentes.length !== 1 ? "s" : ""}${diasAtraso > 0 ? ` e o prazo acordado (${prazoTxt}) foi ultrapassado em ${diasAtraso} dia(s)` : ` com prazo previsto para ${prazoTxt}`}.`
      : `Gostaríamos de verificar o andamento do Pedido #${numPedido}, cujo prazo de entrega estava previsto para ${prazoTxt}${diasAtraso > 0 ? ` e encontra-se com ${diasAtraso} dia(s) alem do prazo acordado` : ""}.`,
    "",
    "Pedimos, por gentileza, que nos envie uma previsao atualizada de entrega ou a confirmacao de despacho dos materiais pendentes.",
  ];
  if (itensPendentes.length > 0) {
    tl.push("", "ITENS PENDENTES:");
    itensPendentes.forEach((it) => {
      const partes = [`  - ${it.descricao}: ${fmtQtd(it.qtdPendente, it.unidade)} pendente`];
      if (it.totalRecebido > 0) partes[0] += ` (${fmtQtd(it.totalRecebido, it.unidade)} ja recebido)`;
      tl.push(partes[0]);
    });
  }
  if (itensEntregues.length > 0) {
    tl.push("", `${itensEntregues.length} ite${itensEntregues.length !== 1 ? "ns ja" : "m ja"} recebido${itensEntregues.length !== 1 ? "s" : ""} — agradecemos o envio.`);
  }
  tl.push("", `Para informar a nova previsao de entrega, acesse: ${linkEntrega}`);
  tl.push("", "Voce tambem pode responder este email diretamente.", "Desde ja agradecemos a atencao e parceria.", "", "Atenciosamente,", "Equipe de Compras — Torg Metal");

  const destinatarios = [emailFornecedor, ...emailsCC];

  const result = await sendEmail({
    to: destinatarios,
    subject,
    html,
    text: tl.join("\n"),
    replyTo: user.email,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Falha ao enviar email" },
      { status: 502 }
    );
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "COBRAR_ENTREGA_FORNECEDOR",
      entity: "PedidoOmie",
      entityId: pedido.id,
      diff: {
        email: emailFornecedor,
        cc: emailsCC,
        diasAtraso,
        itensPendentes: itensPendentes.length,
        itensEntregues: itensEntregues.length,
        temParcial,
        resendId: result.id,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    emailEnviadoPara: emailFornecedor,
    itensPendentes: itensPendentes.length,
    itensEntregues: itensEntregues.length,
  });
}
