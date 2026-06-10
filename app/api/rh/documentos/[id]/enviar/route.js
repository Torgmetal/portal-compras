// POST /api/rh/documentos/[id]/enviar  { para, mensagem? }
// Envia o documento de RH por e-mail COMO ANEXO (não só link), via Resend.
// Só ADMIN/RH. O arquivo é baixado do Blob server-side e anexado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { assertBlobUrlSegura } from "@/lib/blob-url";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  para: z.string().min(3, "Informe o e-mail do destinatário"),
  mensagem: z.string().max(2000).optional().nullable(),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  // Aceita um ou mais e-mails separados por vírgula/ponto-e-vírgula.
  const emails = parsed.data.para.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const invalidos = emails.filter((e) => !EMAIL_RE.test(e));
  if (emails.length === 0 || invalidos.length) {
    return NextResponse.json({ success: false, error: `E-mail inválido: ${invalidos.join(", ") || "(vazio)"}` }, { status: 400 });
  }

  const doc = await prisma.documento.findUnique({
    where: { id: params.id },
    include: { funcionario: { select: { nome: true } } },
  });
  if (!doc?.arquivoUrl) return NextResponse.json({ success: false, error: "Documento sem arquivo" }, { status: 404 });

  try { assertBlobUrlSegura(doc.arquivoUrl); }
  catch { return NextResponse.json({ success: false, error: "Arquivo inválido" }, { status: 400 }); }

  const r = await fetch(doc.arquivoUrl);
  if (!r.ok) return NextResponse.json({ success: false, error: "Falha ao buscar o arquivo" }, { status: 502 });
  const buf = Buffer.from(await r.arrayBuffer());

  const quem = doc.funcionario?.nome || "Empresa";
  const subject = `Documento de RH — ${doc.nome}${doc.funcionario ? ` (${doc.funcionario.nome})` : ""}`;
  const msg = parsed.data.mensagem ? `<p>${escapeHtml(parsed.data.mensagem).replace(/\n/g, "<br>")}</p>` : "";
  const html = `
    <div style="font-family:Arial,sans-serif;color:#002945">
      ${msg}
      <p>Segue em anexo o documento <strong>${escapeHtml(doc.nome)}</strong> (${escapeHtml(doc.tipo)}) — ${escapeHtml(quem)}.</p>
      ${doc.dataValidade ? `<p style="color:#576D7E;font-size:13px">Validade: ${new Date(doc.dataValidade).toLocaleDateString("pt-BR")}</p>` : ""}
      <p style="color:#576D7E;font-size:12px">Enviado pelo Workspace Torg — uso interno / confidencial.</p>
    </div>`;

  const result = await sendEmail({
    to: emails,
    subject,
    html,
    text: `Segue o documento ${doc.nome} (${doc.tipo}) — ${quem}.`,
    attachments: [{ filename: doc.arquivoNome || `${doc.nome}.pdf`, content: buf.toString("base64") }],
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error || "Falha ao enviar e-mail" }, { status: 502 });
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "ENVIAR_DOCUMENTO_EMAIL", entity: "Documento", entityId: doc.id, diff: { para: emails } },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
