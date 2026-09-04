// /api/cron/mural-reenviar?avisoId=<id>
//   POST/GET com Authorization: Bearer <CRON_SECRET> → reenvia um comunicado do
//   mural por e-mail a todos os funcionários ativos com e-mail.
//
// Existe porque a rota do RH (/api/rh/mural/[id]/reenviar) exige sessão de RH/ADMIN;
// este gatilho protegido por CRON_SECRET permite reenviar de fora (ex.: recuperar um
// disparo que não alcançou todo mundo). Mesma lógica de envio (lib/mural-broadcast).
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { enviarAvisoPorEmail } from "@/lib/mural-broadcast";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handler(req) {
  if (!temCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const avisoId = new URL(req.url).searchParams.get("avisoId");
  if (!avisoId) return NextResponse.json({ error: "avisoId obrigatório" }, { status: 400 });

  await aquecerBanco(prisma);
  const aviso = await prisma.muralAviso.findUnique({ where: { id: avisoId } });
  if (!aviso) return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });

  const { enviados, falhas, total } = await enviarAvisoPorEmail(prisma, aviso, aviso.criadoPorNome);

  await prisma.auditLog.create({
    data: {
      userId: null, action: "REENVIAR_MURAL_AVISO", entity: "MuralAviso", entityId: aviso.id,
      diff: { via: "cron", titulo: aviso.titulo, total, emailEnviados: enviados, emailFalhas: falhas.length, falhas: falhas.slice(0, 50) },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, titulo: aviso.titulo, total, enviados, emailFalhas: falhas.length, falhas: falhas.slice(0, 50) });
}

export const GET = handler;
export const POST = handler;
