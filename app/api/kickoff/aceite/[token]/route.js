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

  // ⚠⚠ O ACEITE VAI IMPRESSO NO PDF DO KICK OFF COMO "Confirmado em <data>" — ELE PRECISA SER PROVÁVEL.
  // Medido em 24/08/2026: 183 dos 395 aceites do banco têm `aceitoEm` exatamente 1.440 minutos
  // (24 h cravadas) depois do `enviadoEm` — os 183, sem exceção — e nenhum AuditLog. Os outros 212,
  // esses com log, têm 151 intervalos distintos, que é o que gente clicando produz. Ou seja: alguém
  // marcou 183 aceites por fora do portal, em 15 OPs (092 a 107), e o PDF diz que a Qualidade, o
  // Financeiro e o PCP confirmaram um kick off que ninguém confirmou.
  //
  // Nenhum caminho do código faz isso — esta rota é a única que escreve `aceitoEm`, e escreve
  // `new Date()`. Foi UPDATE manual no banco. Duas mudanças para que não volte a acontecer sem deixar
  // rastro: grava o IP de quem confirmou (igual proposta e relatório já fazem) e põe o AuditLog na
  // MESMA transação do aceite.
  //
  // ⚠ o log não pode mais ser best-effort: era `.catch(() => {})`, então "aceite sem log" também
  // podia ser só o log tendo falhado. Dentro da transação, aceite sem log deixa de existir — e
  // "sem log" vira prova de que não passou por aqui.
  if (!aceite.aceitoEm) {
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    await prisma.$transaction([
      prisma.kickoffAceite.update({
        where: { id: aceite.id },
        data: { aceitoEm: new Date(), aceitoIp: ip },
      }),
      prisma.auditLog.create({
        data: {
          userId: null,
          action: "KICKOFF_ACEITE",
          entity: "KickoffAceite",
          entityId: aceite.id,
          ip,
          userAgent: req.headers.get("user-agent") || null,
          diff: { opNumero: aceite.kickoff.op.numero, email: aceite.email, tipo: aceite.tipo },
        },
      }),
    ]);
  }

  return NextResponse.json({ success: true, aceitoEm: aceite.aceitoEm || new Date() });
}
