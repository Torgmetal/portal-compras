// POST /api/relatorios/[id]/enviar  { para[], cc[]?, assunto?, mensagem? }
// Gera o PDF do relatório e envia por e-mail ao cliente (com cópia opcional),
// anexando o PDF. Marca o relatório como EMITIDO. Acesso: MODS_RELATORIOS.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MODS_RELATORIOS } from "@/lib/relatorios";
import { gerarRelatorioStatusPDF } from "@/lib/relatorio-status-pdf";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  para: z.array(z.string().email()).min(1, "Informe ao menos um destinatário").max(30),
  cc: z.array(z.string().email()).max(60).optional().default([]),
  assunto: z.string().trim().min(2).max(200).optional(),
  mensagem: z.string().max(4000).optional().default(""),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(MODS_RELATORIOS); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const { para, cc, assunto, mensagem } = parsed.data;

  const rel = await prisma.relatorioStatus.findUnique({ where: { id: params.id } });
  if (!rel) return NextResponse.json({ success: false, error: "Relatório não encontrado" }, { status: 404 });

  let out;
  try { out = await gerarRelatorioStatusPDF(rel); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  const nomeArq = out.filename.replace(/["\r\n]/g, "");
  const assuntoFinal = assunto || `Relatório de Status${rel.obra ? " — " + rel.obra : rel.cliente ? " — " + rel.cliente : ""} · Torg Metal`;
  const corpo = (mensagem || "").trim()
    ? `<div style="white-space:pre-wrap">${escapeHtml(mensagem)}</div>`
    : `<p>Segue em anexo o relatório de status${rel.obra ? " da obra <strong>" + escapeHtml(rel.obra) + "</strong>" : ""}.</p>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#002945">
    <div style="background:#0d1f3c;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0"><strong>TORG METAL — Relatório de Status</strong></div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;padding:18px;font-size:14px;line-height:1.6">
      ${corpo}
      <p style="margin-top:16px;color:#576D7E;font-size:12px">Relatório em anexo (PDF). Em caso de dúvidas, é só responder a este e-mail.</p>
    </div>
  </div>`;
  const text = ((mensagem || "").trim() || `Segue em anexo o relatório de status${rel.obra ? " da obra " + rel.obra : ""}.`) + "\n\nTorg Metal";

  const res = await sendEmail({
    to: para,
    cc: cc && cc.length ? cc : undefined,
    subject: assuntoFinal, html, text,
    replyTo: user.email || undefined,
    attachments: [{ filename: nomeArq, content: Buffer.from(out.bytes).toString("base64") }],
  });
  if (!res.ok) return NextResponse.json({ success: false, error: res.error || "Falha ao enviar o e-mail" }, { status: 502 });

  await prisma.relatorioStatus.update({ where: { id: params.id }, data: { status: "EMITIDO" } }).catch(() => {});
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ENVIAR_RELATORIO_STATUS", entity: "RelatorioStatus", entityId: params.id, diff: { para, cc, assunto: assuntoFinal } },
  }).catch(() => {});

  return NextResponse.json({ success: true, para: para.length, cc: (cc || []).length });
}
