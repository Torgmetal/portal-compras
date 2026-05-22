// GET /api/producao/controle/pecas-disponiveis
// Retorna peças não expedidas para o modal "Adicionar peças"
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const pecas = await prisma.pecaConjunto.findMany({
    where: { status: { not: "EXPEDIDO" } },
    select: {
      id: true, opNumero: true, marca: true, descricao: true, qte: true,
      pesoUnitKg: true, pesoTotalKg: true, precoUnitario: true, precoTotal: true,
      status: true, fluxoEspecial: true,
    },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    take: 5000,
  });

  return NextResponse.json({ pecas });
}
