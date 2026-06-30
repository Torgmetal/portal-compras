// GET /api/meu-rh/holerite — lista os holerites do funcionário logado (self-service).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFuncionario } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  let user;
  try {
    user = await requireFuncionario();
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const holerites = await prisma.holerite.findMany({
    where: { funcionarioId: user.funcionarioId },
    orderBy: { competencia: "desc" },
    select: {
      id: true, competencia: true, empresa: true, tipo: true, status: true,
      valorLiquido: true, enviadoEm: true, visualizadoEm: true, confirmadoEm: true,
    },
  });

  return NextResponse.json({ success: true, holerites });
}
