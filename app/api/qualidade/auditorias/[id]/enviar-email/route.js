// POST /api/qualidade/auditorias/[id]/enviar-email  { emails: string[], internos?: string[] }
// Publica a auditoria (se preciso) e envia o link do portal:
//  - emails    → destinatários (auditor/cliente), 1+;
//  - internos  → cópia (CC) para áreas da Torg envolvidas;
//  - anexa o PDF índice (com os links dos documentos), gerado na hora.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";
import { sendEmail } from "@/lib/email";
import { baseUrlDe } from "@/lib/databook-assinaturas";
import { gerarAuditoriaPortalPDF } from "@/lib/auditoria-portal-pdf";
import { escapeHtml } from "@/lib/html";

export const runtime = "nodejs";
export const maxDuration = 60; // gera o PDF índice pra anexar

const listaEmail = z.array(z.string().email().toLowerCase()).max(30);

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  let body;
  try {
    body = z.object({
      emails: listaEmail.min(1, "Informe ao menos um e-mail do auditor"),
      internos: listaEmail.optional().default([]),
    }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const emails = [...new Set(body.emails)];
  const internos = [...new Set(body.internos)].filter((e) => !emails.includes(e)); // sem duplicar no CC

  const aud = await prisma.auditoria.findUnique({ where: { id: params.id }, include: { documentos: true } });
  if (!aud) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });

  const token = aud.token || gerarTokenForte(32);
  const base = baseUrlDe(req);
  const link = `${base}/portal-cliente/${token}`;

  const cfgAtual = aud.portalConfig && typeof aud.portalConfig === "object" && !Array.isArray(aud.portalConfig) ? aud.portalConfig : {};
  await prisma.auditoria.update({
    where: { id: params.id },
    data: {
      token, status: "PUBLICADO", publicadoEm: aud.publicadoEm || new Date(),
      clienteEmail: emails.join(", "), enviadoEmailEm: new Date(),
      portalConfig: { ...cfgAtual, emailsCliente: emails, emailsInternos: internos },
    },
  });

  // PDF índice (capa + links dos documentos publicados) pra anexar ao e-mail.
  let attachments;
  try {
    const docBase = `${base}/api/qualidade/auditorias/portal/${token}/doc`;
    const pdf = await gerarAuditoriaPortalPDF({ ...aud, token }, { portalUrl: link, docBase });
    attachments = [{ filename: pdf.filename, content: Buffer.from(pdf.bytes) }];
  } catch {
    attachments = undefined; // se o PDF falhar, envia mesmo assim (só o link)
  }

  const saud = aud.contato ? `Olá, ${escapeHtml(aud.contato)}!` : "Olá!";
  const tituloHtml = aud.titulo ? ` referente à <strong>${escapeHtml(aud.titulo)}</strong>` : "";
  const logoUrl = `${base}/torg-logo-white.png`;
  const anexoHtml = attachments
    ? `<p style="font-size:14px;line-height:1.6;margin:0 0 22px;color:#334">Anexamos também um <strong>índice em PDF</strong> com os links diretos para cada documento — assim você acessa mesmo depois, sem precisar reabrir o portal.</p>`
    : "";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#002945">
      <div style="background:#0D1F3C;padding:20px 24px 16px;text-align:center;border-radius:8px 8px 0 0">
        <img src="${logoUrl}" alt="TORG METAL" width="158" style="width:158px;max-width:62%;height:auto;display:inline-block;border:0" />
        <div style="color:#9ec0e0;font-size:13px;margin-top:8px;letter-spacing:.4px">Portal do Cliente · Qualidade</div>
          <div style="height:4px;background:#F4801F;"></div>
      </div>
      <div style="border:1px solid #e3e6ea;border-top:none;border-radius:0 0 8px 8px;padding:26px 24px">
        <p style="font-size:16px;font-weight:bold;margin:0 0 14px">${saud}</p>
        <p style="font-size:15px;line-height:1.65;margin:0 0 14px">
          É com grande satisfação que preparamos um portal <strong>exclusivo</strong> para você! Reunimos aqui toda a documentação da qualidade${tituloHtml}, solicitada pela <strong>${escapeHtml(aud.empresa)}</strong> — completa, organizada e pronta para a sua consulta.
        </p>
        <p style="font-size:15px;line-height:1.65;margin:0 0 22px">
          Acesse agora para conferir e baixar os documentos. Temos muito orgulho do nosso padrão de qualidade e será um prazer compartilhá-lo com você!
        </p>
        ${anexoHtml}
        <p style="text-align:center;margin:0 0 24px">
          <a href="${link}" style="background:#006eab;color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">Acessar o portal de documentos</a>
        </p>
        <p style="font-size:13px;color:#576d7e;line-height:1.5;margin:0;border-top:1px solid #eee;padding-top:14px">
          Se o botão não funcionar, copie e cole no navegador:<br><span style="color:#006eab;word-break:break-all">${link}</span>
        </p>
      </div>
    </div>`;
  const text = `${aud.contato ? "Olá, " + aud.contato + "!" : "Olá!"}\n\nÉ com grande satisfação que preparamos um portal exclusivo com toda a documentação da qualidade${aud.titulo ? " referente à " + aud.titulo : ""}, solicitada pela ${aud.empresa}.${attachments ? " Em anexo, um índice em PDF com os links dos documentos." : ""}\n\nAcesse para conferir e baixar: ${link}\n\nUm abraço,\nEquipe da Qualidade — Torg Metal`;

  const r = await sendEmail({
    to: emails,
    cc: internos.length ? internos : undefined,
    subject: `Documentos da qualidade — Torg Metal${aud.titulo ? " — " + aud.titulo : ""}`,
    html, text, attachments, fromName: "Torg Metal - Qualidade",
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "ENVIAR_EMAIL_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: { emails, internos, enviado: r.ok, comAnexo: !!attachments } } }).catch(() => {});
  return NextResponse.json({ success: true, link, enviado: r.ok, comAnexo: !!attachments, destinatarios: emails.length, cc: internos.length });
}
