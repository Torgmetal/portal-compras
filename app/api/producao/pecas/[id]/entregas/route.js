// POST /api/producao/pecas/[id]/entregas — define a divisão de entrega do
// conjunto por destino { entregas: [{ destino, quantidade }] }. Substitui todas.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  entregas: z.array(z.object({
    destino: z.string().trim().min(1, "Destino vazio").max(200),
    quantidade: z.number().int().min(1, "Quantidade mínima 1"),
  })).max(50),
});

export async function POST(req, { params }) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO", "EXPEDICAO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const conj = await prisma.pecaConjunto.findUnique({ where: { id: params.id }, select: { id: true, qte: true } });
  if (!conj) return NextResponse.json({ error: "Conjunto não encontrado" }, { status: 404 });

  const totalAlocado = body.entregas.reduce((s, e) => s + e.quantidade, 0);
  if (totalAlocado > (conj.qte || 0)) {
    return NextResponse.json({ error: `Total alocado (${totalAlocado}) maior que a quantidade do conjunto (${conj.qte}).` }, { status: 400 });
  }

  // Substitui todas as entregas do conjunto
  await prisma.$transaction([
    prisma.conjuntoEntrega.deleteMany({ where: { pecaConjuntoId: params.id } }),
    ...(body.entregas.length
      ? [prisma.conjuntoEntrega.createMany({
          data: body.entregas.map((e) => ({ pecaConjuntoId: params.id, destino: e.destino.trim(), quantidade: e.quantidade })),
        })]
      : []),
  ]);

  const entregas = await prisma.conjuntoEntrega.findMany({
    where: { pecaConjuntoId: params.id },
    select: { id: true, destino: true, quantidade: true },
    orderBy: { destino: "asc" },
  });
  return NextResponse.json({ ok: true, entregas });
}
