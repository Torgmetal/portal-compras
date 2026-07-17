// POST /api/qualidade/auditorias-internas/[id]/divulgar — divulga o relatório
// ao setor: manda o PDF por e-mail aos destinatários e marca como EMITIDO.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { cabecalhoEmail } from "@/lib/email-layout";
import { gerarAuditoriaInternaPDF } from "@/lib/auditoria-interna-pdf";
import { numRAI } from "@/lib/auditoria-interna";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const normEmail = (e) => String(e || "").trim().toLowerCase();

const schema = z.object({
  emails: z.array(z.string().email()).min(1, "Informe ao menos um e-mail."),
  mensagem: z.string().max(2000).optional().nullable(),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const a = await prisma.auditoriaInterna.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const emails = [...new Set(body.emails.map(normEmail))].filter(Boolean);

  let pdf;
  try { pdf = await gerarAuditoriaInternaPDF(a); }
  catch (e) { return NextResponse.json({ error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  const cab = `${numRAI(a.numero)} · ${a.setor}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      ${cabecalhoEmail(`Relatório de Auditoria Interna — ${escapeHtml(numRAI(a.numero))}`, "Torg Metal · Qualidade")}
      <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:14px;color:#002945;">
        ${body.mensagem ? `<p style="margin:0 0 14px;white-space:pre-wrap;line-height:1.55;">${escapeHtml(body.mensagem)}</p>` : `<p style="margin:0 0 14px;line-height:1.55;">Segue em anexo o relatório da auditoria interna realizada no setor <b>${escapeHtml(a.setor)}</b>.</p>`}
        <table style="width:100%;font-size:13px;border-collapse:collapse;margin:12px 0;">
          <tr><td style="padding:6px 0;color:#576D7E;width:150px;">Setor auditado</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(a.setor)}</td></tr>
          <tr><td style="padding:6px 0;color:#576D7E;">Data da auditoria</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(fmtD(a.dataAuditoria))}</td></tr>
          <tr><td style="padding:6px 0;color:#576D7E;">Acompanhamento</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(a.responsavelAcompanhamento || "—")}</td></tr>
        </table>
        <p style="font-size:12px;color:#576D7E;margin:14px 0 0;border-top:1px solid #e5e7eb;padding-top:12px;">
          O relatório completo vai em anexo (<b>${escapeHtml(pdf.filename)}</b>). Enviado por ${escapeHtml(user.name || "Qualidade Torg")} — pode responder este e-mail em caso de dúvida.
        </p>
      </div>
    </div>`;

  const anexo = [{ filename: pdf.filename, content: Buffer.from(pdf.bytes).toString("base64") }];
  let ok = 0;
  for (const email of emails) {
    const r = await sendEmail({ to: email, subject: `Relatório de Auditoria Interna ${numRAI(a.numero)} — ${a.setor}`, html, attachments: anexo, replyTo: user.email || undefined });
    if (r.ok) ok++;
  }

  const historico = Array.isArray(a.divulgadoPara) ? a.divulgadoPara : [];
  const agora = new Date();
  await prisma.auditoriaInterna.update({
    where: { id: a.id },
    data: {
      status: "EMITIDO",
      divulgadoEm: agora,
      divulgadoPara: [...historico, ...emails.map((email) => ({ email, em: agora.toISOString() }))],
    },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DIVULGAR_AUDITORIA_INTERNA", entity: "AuditoriaInterna", entityId: a.id, diff: { enviados: ok, total: emails.length } } }).catch(() => {});

  return NextResponse.json({ success: true, enviados: ok, total: emails.length });
}
