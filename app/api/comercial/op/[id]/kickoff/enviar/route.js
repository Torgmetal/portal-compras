// POST /api/comercial/op/[id]/kickoff/enviar  { para: "a@x,b@y", mensagem? }
// Envia o documento de Kick Off por e-mail aos setores envolvidos (Resend).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  para: z.string().min(3, "Informe os e-mails dos envolvidos"),
  mensagem: z.string().max(2000).optional().nullable(),
});
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// Bloco de seção do e-mail (só renderiza se tiver conteúdo)
function secao(titulo, conteudo) {
  if (!conteudo) return "";
  return `
    <tr><td style="padding:14px 0 4px 0;">
      <p style="margin:0;color:#006EAB;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${titulo}</p>
    </td></tr>
    <tr><td style="padding:0 0 6px 0;border-bottom:1px solid #edf2f7;">
      <p style="margin:0 0 10px 0;color:#2d3748;font-size:14px;line-height:1.6;white-space:pre-wrap;">${conteudo}</p>
    </td></tr>`;
}

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const emails = body.para.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const invalidos = emails.filter((e) => !EMAIL_RE.test(e));
  if (emails.length === 0 || invalidos.length) {
    return NextResponse.json({ error: `E-mail inválido: ${invalidos.join(", ") || "(vazio)"}` }, { status: 400 });
  }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    select: {
      id: true, numero: true, cliente: true, obra: true,
      clienteRazaoSocial: true, clienteCnpj: true, clienteEndereco: true,
      clienteCidade: true, clienteUF: true, clienteContato: true,
      kickoff: true,
      itens: { select: { descricao: true, categoria: true, valorVerba: true, faturamentoDireto: true } },
      aditivos: { select: { itens: { select: { descricao: true, categoria: true, valorVerba: true, faturamentoDireto: true } } } },
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const k = op.kickoff;
  if (!k) return NextResponse.json({ error: "Salve o Kick Off antes de enviar." }, { status: 400 });

  const esc = escapeHtml;
  const todosItens = [...op.itens, ...op.aditivos.flatMap((a) => a.itens)];
  const linhasItens = todosItens.map((it, i) => `
    <tr style="background:${i % 2 ? "#f7fafc" : "#fff"};">
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;">${esc(it.descricao)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#4a5568;">${esc(it.categoria || "—")}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;text-align:right;white-space:nowrap;">${fmtMoeda(it.valorVerba)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">
        <span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;background:${it.faturamentoDireto ? "#d69e2e" : "#006EAB"};">${it.faturamentoDireto ? "Direto (cliente)" : "Torg"}</span>
      </td>
    </tr>`).join("");

  const pontos = (k.pontosAtencao || "").split("\n").map((p) => p.trim()).filter(Boolean);
  const pontosHtml = pontos.length
    ? `<ul style="margin:0;padding-left:18px;color:#742a2a;font-size:14px;line-height:1.7;">${pontos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
    : "";

  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:0 auto;color:#2d3748;">
      <div style="background:#002945;border-radius:10px 10px 0 0;padding:18px 24px;">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:800;">KICK OFF — OP ${esc(op.numero)}</p>
        <p style="margin:4px 0 0 0;color:#90cdf4;font-size:14px;">${esc(op.cliente)}${op.obra ? ` · ${esc(op.obra)}` : ""}</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 10px 10px;padding:20px 24px;">
        ${body.mensagem ? `<div style="background:#ebf8ff;border-left:4px solid #006EAB;padding:10px 14px;border-radius:0 6px 6px 0;margin-bottom:14px;"><p style="margin:0;font-size:14px;color:#2d3748;white-space:pre-wrap;">${esc(body.mensagem)}</p></div>` : ""}

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:6px;">
          <tr><td style="padding:4px 0;color:#718096;width:200px;">Cliente (razão social)</td><td style="padding:4px 0;"><strong>${esc(op.clienteRazaoSocial || op.cliente)}</strong></td></tr>
          ${op.clienteCnpj ? `<tr><td style="padding:4px 0;color:#718096;">CNPJ</td><td style="padding:4px 0;">${esc(op.clienteCnpj)}</td></tr>` : ""}
          ${op.clienteContato ? `<tr><td style="padding:4px 0;color:#718096;">Contato</td><td style="padding:4px 0;">${esc(op.clienteContato)}</td></tr>` : ""}
          ${k.pedidoCompraCliente ? `<tr><td style="padding:4px 0;color:#718096;">Pedido de compra do cliente</td><td style="padding:4px 0;"><strong>${esc(k.pedidoCompraCliente)}</strong></td></tr>` : ""}
          ${k.frete ? `<tr><td style="padding:4px 0;color:#718096;">Frete</td><td style="padding:4px 0;"><strong>${k.frete === "TORG" ? "Por conta da Torg (CIF)" : "Por conta do cliente (FOB)"}</strong></td></tr>` : ""}
          ${k.entregaEndereco ? `<tr><td style="padding:4px 0;color:#718096;vertical-align:top;">Endereço de entrega</td><td style="padding:4px 0;white-space:pre-wrap;">${esc(k.entregaEndereco)}</td></tr>` : ""}
          ${k.notaRetorno ? `<tr><td style="padding:4px 0;color:#718096;">Nota de retorno</td><td style="padding:4px 0;"><strong>SIM</strong>${k.notaRetornoObs ? ` — ${esc(k.notaRetornoObs)}` : ""}</td></tr>` : ""}
        </table>

        <table style="width:100%;border-collapse:collapse;">
          ${secao("Escopo", k.escopo ? esc(k.escopo) : null)}
          ${secao("Padrão de pintura", k.padraoPintura ? esc(k.padraoPintura) : null)}
          ${secao("Inspeção", k.inspecao ? esc(k.inspecao) : null)}
          ${secao("Faturamento / fiscal", k.fiscalObservacao ? esc(k.fiscalObservacao) : null)}
          ${secao("Observações", k.observacoes ? esc(k.observacoes) : null)}
        </table>

        ${pontos.length ? `
        <div style="background:#fff5f5;border:1px solid #feb2b2;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0 0 6px 0;color:#c53030;font-size:13px;font-weight:700;text-transform:uppercase;">⚠ Pontos de atenção</p>
          ${pontosHtml}
        </div>` : ""}

        <p style="margin:18px 0 6px 0;color:#006EAB;font-size:13px;font-weight:700;text-transform:uppercase;">Faturamento por linha do pedido</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <tr style="background:#002945;">
            <th style="padding:8px 10px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;">Item</th>
            <th style="padding:8px 10px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;">Categoria</th>
            <th style="padding:8px 10px;text-align:right;color:#fff;font-size:11px;text-transform:uppercase;">Verba</th>
            <th style="padding:8px 10px;text-align:center;color:#fff;font-size:11px;text-transform:uppercase;">Faturamento</th>
          </tr>
          ${linhasItens}
        </table>

        <hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0 12px 0;">
        <p style="margin:0;color:#a0aec0;font-size:12px;">
          Kick off ${k.kickoffComercialEm ? `comercial em ${fmtData(k.kickoffComercialEm)}` : "comercial pendente"}${k.kickoffSetoresEm ? ` · setores em ${fmtData(k.kickoffSetoresEm)}` : ""}.<br>
          Enviado por ${esc(user.name)} — Workspace Torg (uso interno).
        </p>
      </div>
    </div>`;

  const result = await sendEmail({
    to: emails,
    cc: user.email,
    replyTo: user.email,
    subject: `Kick Off — OP ${op.numero} · ${op.cliente}${op.obra ? ` (${op.obra})` : ""}`,
    html,
    text: `Kick Off da OP ${op.numero} — ${op.cliente}. Acesse o portal para ver o documento completo.`,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Falha ao enviar e-mail" }, { status: 502 });
  }

  await prisma.oPKickOff.update({
    where: { opId: op.id },
    data: { enviadoPara: emails.join(", "), enviadoEm: new Date() },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ENVIAR_KICKOFF", entity: "OPKickOff", entityId: k.id, diff: { opNumero: op.numero, para: emails } },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
