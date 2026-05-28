// POST /api/compras/entregas/cobrar — envia email de cobranca ao fornecedor
// de um pedido com entrega atrasada. Lista os itens do pedido, prazo original,
// dias de atraso e mensagem opcional do comprador.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const schema = z.object({
  pedidoId: z.string().min(1, "pedidoId obrigatorio"),
  mensagem: z.string().optional(),
});

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function fmtQtd(qtd, unidade) {
  if (qtd == null) return "—";
  const decimals = unidade === "KG" ? 1 : 0;
  return `${Number(qtd).toFixed(decimals)} ${unidade || ""}`.trim();
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
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

  const pedido = await prisma.pedidoOmie.findUnique({
    where: { id: body.pedidoId },
    select: {
      id: true,
      numeroPedido: true,
      codigoPedido: true,
      fornecedorNome: true,
      total: true,
      prazoEntregaPrevisto: true,
      statusEntrega: true,
      observacao: true,
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
              precoUnit: true,
              qtdCotada: true,
              prazoEntrega: true,
              rmItem: {
                select: { descricao: true, qtd: true, unidade: true, peso: true },
              },
            },
          },
        },
      },
      rmItens: {
        select: { descricao: true, qtd: true, unidade: true, peso: true },
        take: 20,
      },
    },
  });

  if (!pedido) {
    return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
  }

  // Resolver email do fornecedor
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

  // CC nos emails adicionais
  const emailsCC = pedido.cotacao?.fornecedor?.emailsAdicionais?.filter(Boolean) || [];

  // Dados do pedido
  const numPedido = pedido.numeroPedido || pedido.codigoPedido || "s/n";
  const nomeFornecedor =
    pedido.cotacao?.fornecedor?.razaoSocial ||
    pedido.fornecedorNome ||
    pedido.cotacao?.fornecedorNome ||
    "Fornecedor";

  // Itens
  const itensCotacao = pedido.cotacao?.itens?.map((ci) => ({
    descricao: ci.rmItem?.descricao || "—",
    qtd: ci.rmItem?.peso > 0 ? Number(ci.rmItem.peso) : ci.rmItem?.qtd,
    unidade: ci.rmItem?.peso > 0 ? "KG" : ci.rmItem?.unidade,
  })) || [];

  const itensDiretos = pedido.rmItens?.map((ri) => ({
    descricao: ri.descricao || "—",
    qtd: ri.peso > 0 ? Number(ri.peso) : ri.qtd,
    unidade: ri.peso > 0 ? "KG" : ri.unidade,
  })) || [];

  const itens = itensCotacao.length > 0 ? itensCotacao : itensDiretos;

  // Prazo e dias de atraso
  const prazo = pedido.prazoEntregaPrevisto;
  const prazoTxt = fmtData(prazo);
  const diasAtraso = prazo
    ? Math.ceil((Date.now() - new Date(prazo).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // OP info
  const op = pedido.op || pedido.cotacao?.rm?.op;
  const opLabel = op?.numero ? `OP ${op.numero}${op.cliente ? ` — ${op.cliente}` : ""}` : null;

  const subject = `Cobranca de Entrega — Pedido #${numPedido} (Torg Metal)`;

  // Tabela de itens HTML
  const itensHtml = itens.length > 0
    ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <thead>
          <tr style="background:#f7fafc;">
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#4a5568;">Item</th>
            <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#4a5568;width:100px;">Qtd</th>
          </tr>
        </thead>
        <tbody>
          ${itens.map((it) => `
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #edf2f7;color:#2d3748;">${escapeHtml(it.descricao)}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #edf2f7;color:#4a5568;text-align:right;">${fmtQtd(it.qtd, it.unidade)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : "";

  // Mensagem customizada
  const mensagemExtra = body.mensagem?.trim()
    ? `<div style="background:#fffff0;border:1px solid #fefcbf;border-radius:8px;padding:14px;margin:16px 0;">
        <p style="color:#744210;font-size:13px;margin:0;line-height:1.5;">
          <strong>Mensagem do comprador:</strong><br>
          ${escapeHtml(body.mensagem.trim()).replace(/\n/g, "<br>")}
        </p>
      </div>`
    : "";

  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;max-width:620px;margin:0 auto;color:#2d3748;">
      <h2 style="color:#c53030;margin-top:0;">Cobranca de Entrega</h2>
      <p style="color:#4a5568;line-height:1.5;">
        Ola <strong>${escapeHtml(nomeFornecedor)}</strong>,
      </p>
      <p style="color:#4a5568;line-height:1.5;">
        Verificamos que o <strong>Pedido de Compra #${escapeHtml(numPedido)}</strong> consta com entrega
        ${diasAtraso > 0
          ? `<strong style="color:#c53030;">em atraso de ${diasAtraso} dia${diasAtraso !== 1 ? "s" : ""}</strong>`
          : "pendente"}.
        O prazo previsto era <strong>${prazoTxt}</strong>.
      </p>
      <p style="color:#4a5568;line-height:1.5;">
        Solicitamos, por gentileza, uma <strong>previsao atualizada de entrega</strong> ou
        confirmacao do despacho do material.
      </p>

      ${mensagemExtra}

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#718096;">Pedido</td><td style="padding:6px 0;"><strong>#${escapeHtml(numPedido)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#718096;">Prazo previsto</td><td style="padding:6px 0;"><strong>${prazoTxt}</strong></td></tr>
        ${diasAtraso > 0 ? `<tr><td style="padding:6px 0;color:#718096;">Dias em atraso</td><td style="padding:6px 0;"><strong style="color:#c53030;">${diasAtraso}</strong></td></tr>` : ""}
        ${opLabel ? `<tr><td style="padding:6px 0;color:#718096;">Referencia</td><td style="padding:6px 0;">${escapeHtml(opLabel)}</td></tr>` : ""}
      </table>

      ${itens.length > 0 ? `<p style="color:#4a5568;font-weight:600;margin-bottom:4px;">Itens do pedido:</p>${itensHtml}` : ""}

      <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="color:#4a5568;line-height:1.5;font-size:13px;">
        Favor responder este email com a previsao atualizada.<br>
        Agradecemos a atencao.
      </p>
      <p style="color:#a0aec0;font-size:12px;line-height:1.4;">
        Atenciosamente,<br>
        <strong>Equipe de Compras — Torg Metal</strong>
      </p>
    </div>
  `;

  // Texto plano
  const textLines = [
    `Ola ${nomeFornecedor},`,
    "",
    `O Pedido de Compra #${numPedido} consta com entrega ${diasAtraso > 0 ? `em atraso de ${diasAtraso} dia(s)` : "pendente"}.`,
    `Prazo previsto: ${prazoTxt}.`,
    "",
    "Solicitamos uma previsao atualizada de entrega ou confirmacao do despacho.",
  ];
  if (body.mensagem?.trim()) {
    textLines.push("", `Mensagem do comprador: ${body.mensagem.trim()}`);
  }
  if (itens.length > 0) {
    textLines.push("", "Itens do pedido:");
    itens.forEach((it) => textLines.push(`  - ${it.descricao} (${fmtQtd(it.qtd, it.unidade)})`));
  }
  textLines.push(
    "",
    "Favor responder com a previsao atualizada.",
    "",
    "Atenciosamente,",
    "Equipe de Compras — Torg Metal"
  );

  const destinatarios = [emailFornecedor, ...emailsCC];

  const result = await sendEmail({
    to: destinatarios,
    subject,
    html,
    text: textLines.join("\n"),
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
        resendId: result.id,
      },
    },
  });

  return NextResponse.json({ ok: true, emailEnviadoPara: emailFornecedor });
}
