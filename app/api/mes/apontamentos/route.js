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
  if (obra) {
    // Se a obra for código base (T64), inclui sub-OPs (T64A, T64B, T64C) via startsWith
    // Se vier com letra de sub-OP (T64A), faz match exato
    const ehBase = /^T\d+$/i.test(obra.trim());
    where.obra = ehBase
      ? { startsWith: obra.trim(), mode: "insensitive" }
      : obra.trim();
  }
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

  if (detalhe) {
    // Modo detalhe: retorna apontamentos individuais
    // Suporta: por OP (obra=), por peça (peca=), ou todos no período (somente com filtro de data)
    const rows = await prisma.mesApontamento.findMany({
      where,
      orderBy: [{ dataInicio: "desc" }],
      take: 1000,
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

  // Contagem total de apontamentos para cada obra
  const totaisPorObra = await prisma.mesApontamento.groupBy({
    by: ["obra"],
    where,
    _sum:   { produzidoKg: true, produzidoUn: true },
    _count: { productionId: true },
    _max:   { updatedAt: true },
  });
  const totaisMap = Object.fromEntries(totaisPorObra.map(t => [t.obra, t]));

  // Status dominante por obra: Produzindo > Finalizado Total > Finalizado Parcial > Finalizado
  const statusGrupos = await prisma.mesApontamento.groupBy({
    by: ["obra", "status"],
    where,
    _count: { productionId: true },
  });
  const PRIO = { "Produzindo": 4, "Finalizado Total": 3, "Finalizado Parcial": 2, "Finalizado": 1 };
  const statusMap = {};
  for (const row of statusGrupos) {
    const cur = statusMap[row.obra];
    if (!cur || (PRIO[row.status] || 0) > (PRIO[cur] || 0)) {
      statusMap[row.obra] = row.status;
    }
  }

  // Não Iniciadas: OPs ativas do portal sem apontamentos no período
  const normNum = (obra) => { const m = (obra || "").match(/^T(\d+)/i); return m ? String(parseInt(m[1])) : ""; };
  const skaNormSet = new Set(obrasUnicas.map(normNum).filter(Boolean));
  const opsAtivas = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
    orderBy: { numero: "asc" },
  });
  const naoIniciadas = opsAtivas
    .filter(op => !skaNormSet.has(String(parseInt(op.numero || "0"))))
    .map(op => ({
      obra:   `T${parseInt(op.numero)}`,
      opInfo: { id: op.id, cliente: op.cliente, obra: op.obra, numero: op.numero },
    }));

  return NextResponse.json({ grupos, opMap, totaisMap, statusMap, naoIniciadas, ultimoSync });
}
