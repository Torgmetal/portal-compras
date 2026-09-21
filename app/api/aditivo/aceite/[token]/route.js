// GET/POST /api/aditivo/aceite/[token] — aceite do Comunicado de Aditivo por quem recebeu o e-mail
// (público, por token único — mesmo desenho do aceite do Kick Off).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const limiter = createRateLimiter({ name: "aditivo-aceite", maxRequests: 20, windowMs: 60_000 });

async function buscarAceite(token) {
  if (!token || token.length < 10) return null;
  return prisma.aditivoAceite.findUnique({
    where: { token },
    include: { aditivo: { select: { id: true, numero: true, descricao: true, op: { select: { numero: true, cliente: true, obra: true } } } } },
  });
}

export async function GET(req, { params }) {
  const rl = limiter(req);
  if (!rl.success) return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });
  const aceite = await buscarAceite(params.token);
  if (!aceite) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({ email: aceite.email, aceitoEm: aceite.aceitoEm, aditivo: { numero: aceite.aditivo.numero, descricao: aceite.aditivo.descricao }, op: aceite.aditivo.op });
}

export async function POST(req, { params }) {
  const rl = limiter(req);
  if (!rl.success) return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });
  const aceite = await buscarAceite(params.token);
  if (!aceite) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  if (!aceite.aceitoEm) {
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    // ⚠ o AuditLog entra na MESMA transação (lição dos 183 aceites do Kick Off marcados por fora)
    await prisma.$transaction([
      prisma.aditivoAceite.update({ where: { id: aceite.id }, data: { aceitoEm: new Date(), aceitoIp: ip } }),
      prisma.auditLog.create({
        data: { userId: null, action: "ADITIVO_ACEITE", entity: "AditivoAceite", entityId: aceite.id, ip, userAgent: req.headers.get("user-agent") || null,
                diff: { opNumero: aceite.aditivo.op.numero, aditivo: aceite.aditivo.numero, email: aceite.email } },
      }),
    ]);
  }
  return NextResponse.json({ success: true, aceitoEm: aceite.aceitoEm || new Date() });
}
