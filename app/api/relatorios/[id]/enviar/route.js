// POST /api/relatorios/[id]/enviar  { para[], cc[]?, assunto?, mensagem? }
// Gera o PDF, envia ao cliente (cópia opcional) com o PDF anexo + link de ACEITE
// público. Registra o envio no histórico e marca EMITIDO. Acesso: MODS_RELATORIOS.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MODS_RELATORIOS } from "@/lib/relatorios";
import { gerarRelatorioStatusPDF } from "@/lib/relatorio-status-pdf";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { gerarTokenForte } from "@/lib/token";
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

  const token = rel.token || gerarTokenForte();
  const origin = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const aceiteUrl = `${origin}/relatorio/aceite/${token}`;

  const nomeArq = out.filename.replace(/["\r\n]/g, "");
  const assuntoFinal = assunto || `Relatório de Status${rel.obra ? " — " + rel.obra : rel.cliente ? " — " + rel.cliente : ""} · Torg Metal`;
  const corpo = (mensagem || "").trim()
    ? `<div style="white-space:pre-wrap">${escapeHtml(mensagem)}</div>`
    : `<p>Segue o relatório de status${rel.obra ? " da obra <strong>" + escapeHtml(rel.obra) + "</strong>" : ""}.</p>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#002945">
    <div style="background:#0D1F3C;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0"><strong>TORG METAL — Relatório de Status</strong></div>
    <div style="height:4px;background:#F4801F;"></div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;padding:18px;font-size:14px;line-height:1.6">
      ${corpo}
      <p style="margin:20px 0"><a href="${aceiteUrl}" style="display:inline-block;background:#006EAB;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Ver relatório e confirmar recebimento</a></p>
      <p style="color:#576D7E;font-size:12px">O relatório também segue em anexo (PDF). No botão acima você pode registrar o <strong>aceite (recebimento)</strong> — fica gravado com data e hora.</p>
    </div>
  </div>`;
  const text = ((mensagem || "").trim() || `Segue o relatório de status${rel.obra ? " da obra " + rel.obra : ""}.`) + `\n\nVer e confirmar o recebimento: ${aceiteUrl}\n\nTorg Metal`;

  const res = await sendEmail({
    to: para,
    cc: cc && cc.length ? cc : undefined,
    subject: assuntoFinal, html, text,
    replyTo: user.email || undefined,
    attachments: [{ filename: nomeArq, content: Buffer.from(out.bytes).toString("base64") }],
  });
  if (!res.ok) return NextResponse.json({ success: false, error: res.error || "Falha ao enviar o e-mail" }, { status: 502 });

  const envios = Array.isArray(rel.envios) ? rel.envios : [];
  envios.push({ para, cc: cc || [], porNome: user.name || null, em: new Date().toISOString() });
  await prisma.relatorioStatus.update({
    where: { id: params.id },
    data: { status: "EMITIDO", token, envios },
  }).catch(() => {});
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ENVIAR_RELATORIO_STATUS", entity: "RelatorioStatus", entityId: params.id, diff: { para, cc, assunto: assuntoFinal } },
  }).catch(() => {});

  return NextResponse.json({ success: true, para: para.length, cc: (cc || []).length });
}
