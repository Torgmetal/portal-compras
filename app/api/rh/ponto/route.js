// GET /api/rh/ponto                      → competências (histórico)
// GET /api/rh/ponto?competencia=AAAA-MM   → a competência com itens + funcionários (p/ mapear)
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const competencia = new URL(req.url).searchParams.get("competencia");

  const competencias = await prisma.pontoCompetencia.findMany({
    orderBy: { competencia: "desc" },
    select: { id: true, competencia: true, status: true, empresa: true, _count: { select: { itens: true } } },
  });

  if (!competencia) return NextResponse.json({ success: true, competencias });

  const ponto = await prisma.pontoCompetencia.findUnique({
    where: { competencia },
    include: { itens: { orderBy: [{ nome: "asc" }, { pisArquivo: "asc" }] } },
  });
  if (!ponto) return NextResponse.json({ success: true, competencias, ponto: null });

  // Funcionários ativos p/ o dropdown de mapeamento dos PIS não casados
  const funcionarios = await prisma.funcionario.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, matricula: true, empresa: true },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json({
    success: true, competencias, funcionarios,
    ponto: { id: ponto.id, competencia: ponto.competencia, empresa: ponto.empresa, status: ponto.status, itens: ponto.itens },
  });
}
