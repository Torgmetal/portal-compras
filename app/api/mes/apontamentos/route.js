import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/mes/apontamentos
// Retorna sumário agrupado por obra+setor (ou detalhe quando ?obra=XXX)
// Auth: sessão NextAuth (ADMIN, PRODUCAO, COMERCIAL, COMPRAS)

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const obra    = searchParams.get("obra") || null;
  const setor   = searchParams.get("setor") || null;
  const status  = searchParams.get("status") || null;
  const de      = searchParams.get("de") || null;    // YYYY-MM-DD
  const ate     = searchParams.get("ate") || null;   // YYYY-MM-DD
  const detalhe = searchParams.get("detalhe") === "1"; // retorna linhas individuais

  // Filtro base
  const where = {};
  if (obra)   where.obra   = obra;
  if (setor)  where.setor  = { contains: setor, mode: "insensitive" };
  if (status) where.status = status;
  if (de || ate) {
    where.dataInicio = {};
    if (de)  where.dataInicio.gte = new Date(de + "T00:00:00");
    if (ate) where.dataInicio.lte = new Date(ate + "T23:59:59");
  }

  // Último sync
  const ultimoSync = await prisma.mesSyncLog.findFirst({
    orderBy: { criadoEm: "desc" },
  });

  if (detalhe && obra) {
    // Modo detalhe: retorna apontamentos individuais de uma OP
    const rows = await prisma.mesApontamento.findMany({
      where,
      orderBy: [{ dataInicio: "desc" }],
      take: 2000,
    });
    return NextResponse.json({ rows, ultimoSync });
  }

  // Modo sumário: groupBy obra + setor
  const grupos = await prisma.mesApontamento.groupBy({
    by: ["obra", "setor"],
    where,
    _sum:   { produzidoKg: true, produzidoUn: true, rejeitado: true, retrabalhado: true },
    _count: { productionId: true },
    _max:   { dataFim: true, updatedAt: true },
    orderBy: [{ obra: "asc" }],
  });

  // Carrega info das OPs (numero, cliente, obra/descricao)
  const obrasUnicas = [...new Set(grupos.map(g => g.obra))];
  const ops = await prisma.oP.findMany({
    where: { numero: { in: obrasUnicas } },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  const opMap = Object.fromEntries(ops.map(o => [o.numero, o]));

  // Contagem total de apontamentos (sem groupBy) para cada obra
  const totaisPorObra = await prisma.mesApontamento.groupBy({
    by: ["obra"],
    where,
    _sum:   { produzidoKg: true, produzidoUn: true },
    _count: { productionId: true },
    _max:   { updatedAt: true },
  });
  const totaisMap = Object.fromEntries(totaisPorObra.map(t => [t.obra, t]));

  return NextResponse.json({ grupos, opMap, totaisMap, ultimoSync });
}
