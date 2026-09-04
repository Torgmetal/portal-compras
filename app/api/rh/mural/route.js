// /api/rh/mural
//   GET  → lista os avisos do mural (visão RH).
//   POST { titulo, corpo, fixado?, enviarEmail? } → cria o aviso e, se enviarEmail,
//         dispara para todos os funcionários ativos com e-mail. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { enviarAvisoPorEmail } from "@/lib/mural-broadcast";
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
  // ⚠ Via Resend Batch (lib/mural-broadcast): uma requisição só, sem estourar o
  // rate limit que fazia o comunicado chegar a só parte dos funcionários. As falhas
  // voltam discriminadas — o RH vê quantas e pode reenviar.
  let emailEnviados = 0; let emailFalhas = [];
  if (enviarEmail) {
    const r = await enviarAvisoPorEmail(prisma, aviso, user.name);
    emailEnviados = r.enviados;
    emailFalhas = r.falhas;
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "CRIAR_MURAL_AVISO", entity: "MuralAviso", entityId: aviso.id,
      diff: { titulo, enviarEmail, emailEnviados, emailFalhas: emailFalhas.length, falhas: emailFalhas.slice(0, 50) },
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, id: aviso.id, emailEnviados, emailFalhas: emailFalhas.length });
}
