// POST /api/comercial/orcamento-servico/[id]/enviar-aceite
// Gera (ou reusa) o token de aceite e manda ao cliente um e-mail com o link
// público de APROVAÇÃO da proposta + o PDF em anexo. Requer proposta consolidada.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarPropostaPDF } from "@/lib/proposta-servico-pdf";
import { sendEmail } from "@/lib/email";
import { gerarTokenForte } from "@/lib/token";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  para: z.string().email("E-mail do cliente inválido").optional(),
  cc: z.array(z.string().email()).max(30).optional().default([]),
  mensagem: z.string().max(4000).optional().default(""),
});
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const d = parsed.data;

  const o = await prisma.orcamentoServico.findUnique({ where: { id: params.id } });
  if (!o) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });
  if (!o.consolidadaEm) return NextResponse.json({ success: false, error: "Consolide a proposta antes de enviar para aceite." }, { status: 400 });

  const para = (d.para || o.email || "").trim();
  if (!para) return NextResponse.json({ success: false, error: "Informe o e-mail do cliente." }, { status: 400 });

  let pdf, numeroPtc;
  try { const r = await gerarPropostaPDF(o); numeroPtc = r.numeroPtc; pdf = Buffer.from(r.bytes); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  const token = o.aceiteToken || gerarTokenForte();
  const origin = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const aceiteUrl = `${origin}/proposta/aceite/${token}`;

  const saud = o.contato ? `Prezado(a) ${esc(o.contato)},` : "Prezados(as),";
  const msg = d.mensagem ? `<p>${esc(d.mensagem).replace(/\n/g, "<br>")}</p>` : "";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
      <p>${saud}</p>
      ${msg}
      <p>Encaminhamos a nossa <strong>Proposta Comercial ${esc(numeroPtc)}</strong>${o.obra ? ` referente a <strong>${esc(o.obra)}</strong>` : ""} para a sua análise e aprovação.</p>
      <p style="margin:20px 0"><a href="${aceiteUrl}" style="display:inline-block;background:#006EAB;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Ver proposta e aprovar</a></p>
      <p style="color:#576D7E;font-size:12px">A proposta também segue em anexo (PDF). No botão acima você registra a <strong>aprovação</strong> — fica gravada com data, hora e IP.</p>
      <p>Atenciosamente,<br><strong>Torg Metal</strong> — Comercial</p>
    </div>`;
  const text = `${o.contato ? "Prezado(a) " + o.contato + "," : "Prezados(as),"}\n\n${d.mensagem || ""}\n\nProposta Comercial ${numeroPtc}${o.obra ? " referente a " + o.obra : ""}.\nVer e aprovar: ${aceiteUrl}\n\nAtenciosamente,\nTorg Metal — Comercial`;

  const envio = await sendEmail({
    to: para, cc: d.cc,
    subject: `Aprovação — Proposta ${numeroPtc} — Torg Metal${o.obra ? " — " + o.obra : ""}`,
    html, text,
    fromName: "Torg Metal - Comercial",
    replyTo: user.email || undefined,
    attachments: [{ filename: `${numeroPtc}.pdf`, content: pdf }],
  });
  if (!envio.ok) return NextResponse.json({ success: false, error: "Falha no envio do e-mail: " + (envio.error || "") }, { status: 502 });

  const now = new Date();
  const os = await prisma.orcamentoServico.update({
    where: { id: o.id },
    data: { aceiteToken: token, aceiteEnviadoEm: now },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ENVIAR_ACEITE_PROPOSTA", entity: "OrcamentoServico", entityId: o.id, diff: { numeroPtc, para, cc: d.cc } },
  }).catch(() => {});

  return NextResponse.json({ success: true, numeroPtc, aceiteUrl, orcamento: os });
}
