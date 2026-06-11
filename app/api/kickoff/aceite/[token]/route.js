// GET/POST /api/kickoff/aceite/[token] — aceite público do Kick Off por token
// único enviado no e-mail de divulgação. GET retorna o contexto; POST registra
// o aceite (idempotente).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ name: "kickoff-aceite", maxRequests: 20, windowMs: 60_000 });

async function buscarAceite(token) {
  if (!token || token.length < 10) return null;
  return prisma.kickoffAceite.findUnique({
    where: { token },
    include: {
      kickoff: {
        select: {
          id: true,
          op: { select: { numero: true, cliente: true, obra: true } },
        },
      },
    },
  });
}

export async function GET(req, { params }) {
  const rl = limiter(req);
  if (!rl.success) return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });

  const aceite = await buscarAceite(params.token);
  if (!aceite) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  return NextResponse.json({
    tipo: aceite.tipo,
    email: aceite.email,
    aceitoEm: aceite.aceitoEm,
    op: aceite.kickoff.op,
  });
}

export async function POST(req, { params }) {
  const rl = limiter(req);
  if (!rl.success) return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });

  const aceite = await buscarAceite(params.token);
  if (!aceite) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  if (!aceite.aceitoEm) {
    await prisma.kickoffAceite.update({
      where: { id: aceite.id },
      data: { aceitoEm: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: "KICKOFF_ACEITE",
        entity: "KickoffAceite",
        entityId: aceite.id,
        diff: { opNumero: aceite.kickoff.op.numero, email: aceite.email, tipo: aceite.tipo },
      },
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, aceitoEm: aceite.aceitoEm || new Date() });
}
