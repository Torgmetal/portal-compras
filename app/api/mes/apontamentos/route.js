import { NextResponse } from "next/server";
import { prisma, waitMesTables } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/mes/apontamentos
// Retorna sumário agrupado por obra+setor (ou detalhe quando ?obra=XXX)
// Auth: sessão NextAuth (ADMIN, PRODUCAO, COMERCIAL, COMPRAS)

export async function GET(req) {
  await waitMesTables();
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
  const peca    = searchParams.get("peca") || null;  // busca por peça (descricaoItem ou opSka)

  // Filtro base
  const where = {};
  if (obra)   where.obra   = obra;
  if (setor)  where.setor  = { contains: setor, mode: "insensitive" };
  if (status) where.status = status;
  if (de || ate) {
    // Datas armazenadas como UTC naïve (horário BRT sem offset aplicado).
    // Comparamos com meia-noite UTC para preservar o dia exato do Brasil.
    where.dataInicio = {};
    if (de)  where.dataInicio.gte = new Date(de  + "T00:00:00.000Z");
    if (ate) where.dataInicio.lte = new Date(ate + "T23:59:59.999Z");
  }
  if (peca) {
    where.OR = [
      { descricaoItem: { contains: peca, mode: "insensitive" } },
      { opSka:         { contains: peca, mode: "insensitive" } },
    ];
  }

  // Último sync
  const ultimoSync = await prisma.mesSyncLog.findFirst({
    orderBy: { criadoEm: "desc" },
  });

  if (detalhe && (obra || peca)) {
    // Modo detalhe: retorna apontamentos individuais (por OP ou busca por peça)
    const rows = await prisma.mesApontamento.findMany({
      where,
      orderBy: [{ dataInicio: "desc" }],
      take: 500,
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

  // Carrega info das OPs — converte T64 → 064 para encontrar no portal
  const obrasUnicas = [...new Set(grupos.map(g => g.obra))];
  function obraParaNumeroOP(obra) {
    if (!obra) return obra;
    const m = obra.match(/^T(\d+)/i);
    if (!m) return obra;
    return String(parseInt(m[1])).padStart(3, "0");
  }
  const numerosPortal = [...new Set(obrasUnicas.map(obraParaNumeroOP))];
  const ops = await prisma.oP.findMany({
    where: { numero: { in: numerosPortal } },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  const opMapPorNumero = Object.fromEntries(ops.map(o => [o.numero, o]));
  // Chave = obra SKA (T64) → info da OP
  const opMap = Object.fromEntries(
    obrasUnicas.map(obra => [obra, opMapPorNumero[obraParaNumeroOP(obra)] || null])
  );

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
