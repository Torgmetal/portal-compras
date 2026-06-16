// POST /api/qualidade/auditorias/[id]/enviar-email  { email }
// Publica a auditoria (se preciso) e envia ao cliente o e-mail com o link do portal.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  let body;
  try {
    body = z.object({ email: z.string().email("E-mail inválido").toLowerCase() }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const aud = await prisma.auditoria.findUnique({
    where: { id: params.id },
    include: { documentos: { where: { tipo: "EVIDENCIA" }, select: { id: true } } },
  });
  if (!aud) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });
  if (aud.documentos.length === 0) {
    return NextResponse.json({ success: false, error: "Adicione ao menos um documento para o cliente antes de enviar." }, { status: 400 });
  }

  const token = aud.token || gerarTokenForte(32);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const base = (process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.startsWith("http")) ? process.env.NEXTAUTH_URL : (host ? `https://${host}` : "");
  const link = `${base}/portal-cliente/${token}`;

  await prisma.auditoria.update({
    where: { id: params.id },
    data: { token, status: "PUBLICADO", publicadoEm: aud.publicadoEm || new Date(), clienteEmail: body.email, enviadoEmailEm: new Date() },
  });

  const saud = aud.contato ? `Prezado(a) ${aud.contato},` : "Prezado(a) cliente,";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#002945">
      <div style="background:#002945;padding:22px 24px;border-radius:8px 8px 0 0">
        <div style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:.5px">TORG METAL</div>
        <div style="color:#9ec0e0;font-size:12px;margin-top:2px">Portal do Cliente · Qualidade</div>
      </div>
      <div style="border:1px solid #e3e6ea;border-top:none;border-radius:0 0 8px 8px;padding:24px">
        <p style="font-size:15px;margin:0 0 12px">${saud}</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
          Preparamos um portal exclusivo com a documentação da qualidade${aud.titulo ? ` referente à <strong>${aud.titulo}</strong>` : ""} solicitada pela ${aud.empresa}. Acesse para conferir e baixar os documentos.
        </p>
        <p style="text-align:center;margin:0 0 22px">
          <a href="${link}" style="background:#006eab;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">Acessar o portal de documentos</a>
        </p>
        <p style="font-size:12px;color:#576d7e;line-height:1.5;margin:0;border-top:1px solid #eee;padding-top:14px">
          Se o botão não funcionar, copie e cole no navegador:<br><span style="color:#006eab;word-break:break-all">${link}</span>
        </p>
      </div>
    </div>`;
  const text = `${saud}\nPortal da qualidade da Torg Metal${aud.titulo ? " — " + aud.titulo : ""}. Acesse: ${link}`;

  let enviado = true;
  try {
    await sendEmail({ to: body.email, subject: `Documentos da qualidade — Torg Metal${aud.titulo ? " — " + aud.titulo : ""}`, html, text });
  } catch {
    enviado = false;
  }
  await prisma.auditLog.create({ data: { userId: user.id, action: "ENVIAR_EMAIL_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: { email: body.email, enviado } } }).catch(() => {});
  return NextResponse.json({ success: true, link, enviado });
}
