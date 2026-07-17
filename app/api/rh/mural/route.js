// /api/rh/mural
//   GET  → lista os avisos do mural (visão RH).
//   POST { titulo, corpo, fixado?, enviarEmail? } → cria o aviso e, se enviarEmail,
//         dispara para todos os funcionários ativos com e-mail. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { isBlobUrlSegura } from "@/lib/blob-url";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  titulo: z.string().trim().min(3, "Título muito curto").max(160),
  corpo: z.string().trim().min(3, "Escreva o comunicado").max(5000),
  imagemUrl: z.string().url().optional().nullable(),
  fixado: z.boolean().optional().default(false),
  enviarEmail: z.boolean().optional().default(false),
});

function montarHtml({ titulo, corpo, autor, imagemUrl }) {
  const imgHtml = imagemUrl
    ? `<img src="${imagemUrl}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:0 0 14px;display:block" />`
    : "";
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
    <div style="background:#0D1F3C;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
      <strong style="font-size:16px">📢 Comunicado do RH — Torg Metal</strong>
    </div>
    <div style="height:4px;background:#F4801F;"></div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:20px">
      <h2 style="color:#002945;margin:0 0 10px">${escapeHtml(titulo)}</h2>
      ${imgHtml}
      <div style="color:#333;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(corpo)}</div>
      <p style="margin-top:22px;font-size:12px;color:#888">${autor ? escapeHtml(autor) + " · " : ""}Você recebeu este comunicado por fazer parte da equipe Torg. Veja todos os avisos no portal do funcionário.</p>
    </div>
  </div>`;
}

export async function GET() {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const avisos = await prisma.muralAviso.findMany({
    orderBy: [{ fixado: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  return NextResponse.json({ success: true, avisos });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const { titulo, corpo, fixado, enviarEmail } = parsed.data;

  // Só aceita imagem do nosso Blob (evita guardar URL externa arbitrária).
  const imagemUrl = parsed.data.imagemUrl && isBlobUrlSegura(parsed.data.imagemUrl) ? parsed.data.imagemUrl : null;

  const aviso = await prisma.muralAviso.create({
    data: { titulo, corpo, imagemUrl, fixado, criadoPorId: user.id, criadoPorNome: user.name || null },
  });

  // Broadcast por e-mail (best-effort: uma falha de envio não desfaz o aviso).
  let emailEnviados = 0; const emailFalhas = [];
  if (enviarEmail) {
    const funcs = await prisma.funcionario.findMany({
      where: { ativo: true, email: { not: null } },
      select: { email: true },
    });
    const destinos = [...new Set(funcs.map((f) => (f.email || "").trim()).filter(Boolean))];
    const html = montarHtml({ titulo, corpo, autor: user.name, imagemUrl });
    const text = `Comunicado do RH — Torg Metal\n\n${titulo}\n\n${corpo}`;
    const subject = `📢 ${titulo}`;
    // Envio individual (preserva privacidade) em lotes p/ não estourar o tempo.
    const LOTE = 6;
    for (let i = 0; i < destinos.length; i += LOTE) {
      const chunk = destinos.slice(i, i + LOTE);
      const res = await Promise.all(chunk.map((to) => sendEmail({ to, subject, html, text }).catch(() => ({ ok: false }))));
      res.forEach((r, j) => { if (r?.ok) emailEnviados++; else emailFalhas.push(chunk[j]); });
    }
    await prisma.muralAviso.update({
      where: { id: aviso.id },
      data: { emailEnviadoEm: new Date(), emailDestinatarios: emailEnviados },
    }).catch(() => {});
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "CRIAR_MURAL_AVISO", entity: "MuralAviso", entityId: aviso.id, diff: { titulo, enviarEmail, emailEnviados } },
  }).catch(() => {});

  return NextResponse.json({ success: true, id: aviso.id, emailEnviados, emailFalhas: emailFalhas.length });
}
