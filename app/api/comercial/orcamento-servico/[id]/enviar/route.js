// POST /api/comercial/orcamento-servico/[id]/enviar
// Gera a proposta em PDF (CloudConvert) e manda ao cliente por e-mail (Resend),
// com saudação formal, nº da proposta + revisão, mensagem estratégica e CC do
// comercial. Registra o envio (1º envio grava a R00 / enviadoEm / status).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarPropostaPDF } from "@/lib/proposta-servico-pdf";
import { sendEmail } from "@/lib/email";
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

  const para = (d.para || o.email || "").trim();
  if (!para) return NextResponse.json({ success: false, error: "Informe o e-mail do cliente." }, { status: 400 });

  // gera o PDF direto (pdf-lib, sem serviço externo)
  let pdf, numeroPtc;
  try {
    const r = await gerarPropostaPDF(o);
    numeroPtc = r.numeroPtc;
    pdf = Buffer.from(r.bytes);
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 });
  }

  const rev = String(o.revisao || 0).padStart(2, "0");
  const saud = o.contato ? `Prezado(a) ${esc(o.contato)},` : "Prezados(as),";
  const msg = d.mensagem ? `<p>${esc(d.mensagem).replace(/\n/g, "<br>")}</p>` : "";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
      <p>${saud}</p>
      ${msg}
      <p>Encaminhamos em anexo a nossa <strong>Proposta Comercial ${esc(numeroPtc)}</strong>${o.obra ? ` referente a <strong>${esc(o.obra)}</strong>` : ""} (revisão ${rev}).</p>
      <p>Ficamos à disposição para quaisquer esclarecimentos e, desde já, agradecemos a oportunidade de trabalharmos juntos.</p>
      <p>Atenciosamente,<br><strong>Torg Metal</strong> — Comercial</p>
    </div>`;
  const text = `${o.contato ? "Prezado(a) " + o.contato + "," : "Prezados(as),"}\n\n${d.mensagem || ""}\n\nEncaminhamos em anexo a nossa Proposta Comercial ${numeroPtc}${o.obra ? " referente a " + o.obra : ""} (revisão ${rev}).\n\nAtenciosamente,\nTorg Metal — Comercial`;

  const envio = await sendEmail({
    to: para,
    cc: d.cc,
    subject: `Proposta ${numeroPtc} — Torg Metal${o.obra ? " — " + o.obra : ""}`,
    html, text,
    fromName: "Torg Metal - Comercial",
    replyTo: user.email || undefined,
    attachments: [{ filename: `${numeroPtc}.pdf`, content: pdf }],
  });
  if (!envio.ok) return NextResponse.json({ success: false, error: "Falha no envio do e-mail: " + (envio.error || "") }, { status: 502 });

  const now = new Date();
  const revisoes = Array.isArray(o.revisoes) ? o.revisoes : [];
  const dataUpd = {
    status: "ENVIADO",
    enviadoEm: o.enviadoEm || now,
    envios: [...(Array.isArray(o.envios) ? o.envios : []), { data: now.toISOString(), para, cc: d.cc, revisao: o.revisao || 0, porNome: user.name || null }],
  };
  if (!revisoes.length) dataUpd.revisoes = [{ num: 0, data: now.toISOString(), motivo: "Emissão inicial" }];
  const os = await prisma.orcamentoServico.update({ where: { id: o.id }, data: dataUpd });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ENVIAR_PROPOSTA_SERVICO", entity: "OrcamentoServico", entityId: o.id, diff: { numeroPtc, para, cc: d.cc } },
  }).catch(() => {});

  return NextResponse.json({ success: true, numeroPtc, orcamento: os });
}
