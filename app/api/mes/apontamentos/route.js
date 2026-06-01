import { NextResponse } from "next/server";
import { prisma, waitMesTables } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/mes/apontamentos
// Fonte: MesOrdem (dataset 150 — planejado vs produzido).
// Retorna sumário por obra+setor, ou linhas individuais (detalhe=1).
// Mantém o mesmo formato que a tela consome (produzidoKg, productionId…).

function obraParaNumeroOP(obra) {
  if (!obra) return obra;
  const m = obra.match(/^T(\d+)/i);
  if (!m) return obra;
  return String(parseInt(m[1])).padStart(3, "0");
}

export async function GET(req) {
  await waitMesTables();
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const { searchParams } = new URL(req.url);
  const obra    = searchParams.get("obra") || null;
  const setor   = searchParams.get("setor") || null;
  const status  = searchParams.get("status") || null;
  const de      = searchParams.get("de") || null;
  const ate     = searchParams.get("ate") || null;
  const detalhe = searchParams.get("detalhe") === "1";
  const peca    = searchParams.get("peca") || null;

  const where = {};
  if (obra) {
    const ehBase = /^T\d+$/i.test(obra.trim());
    where.obra = ehBase ? { startsWith: obra.trim(), mode: "insensitive" } : obra.trim();
  }
  if (setor)  where.setor  = { contains: setor, mode: "insensitive" };
  if (status) where.status = status;
  if (de || ate) {
    where.dataInicio = {};
    if (de)  where.dataInicio.gte = new Date(de  + "T00:00:00.000Z");
    if (ate) where.dataInicio.lte = new Date(ate + "T23:59:59.999Z");
  }
  if (peca) {
    where.OR = [
      { descItem: { contains: peca, mode: "insensitive" } },
      { op:       { contains: peca, mode: "insensitive" } },
      { item:     { contains: peca, mode: "insensitive" } },
    ];
  }

  const ultimoSync = await prisma.mesSyncLog.findFirst({ orderBy: { criadoEm: "desc" } });

  // ── Modo detalhe: linhas individuais (mapeadas p/ o formato da tela) ──────────
  if (detalhe) {
    const ordens = await prisma.mesOrdem.findMany({
      where,
      orderBy: [{ dataInicio: "desc" }],
      take: 1000,
    });
    const rows = ordens.map(o => ({
      id:            o.id,
      obra:          o.obra,
      opSka:         o.op,
      descricaoItem: o.descItem,
      setor:         o.setor,
      maquina:       o.maquina,
      operador:      o.operador,
      produzidoKg:   o.pesoProduzido,
      produzidoUn:   o.produzidoUn,
      planejadoUn:   o.planejadoUn,
      pesoPlanejado: o.pesoPlanejado,
      status:        o.status,
      dataInicio:    o.dataInicio,
      dataFim:       o.dataFim,
    }));
    return NextResponse.json({ rows, ultimoSync });
  }

  // ── Modo sumário: groupBy obra+setor ──────────────────────────────────────────
  const grupos0 = await prisma.mesOrdem.groupBy({
    by: ["obra", "setor"],
    where,
    _sum:   { pesoProduzido: true, produzidoUn: true, rejeitadoUn: true, pesoPlanejado: true },
    _count: { id: true },
    _max:   { dataFim: true, updatedAt: true },
    orderBy: [{ obra: "asc" }],
  });
  // Remapeia para o formato que a tela espera (produzidoKg, productionId…)
  const grupos = grupos0.map(g => ({
    obra:  g.obra,
    setor: g.setor,
    _sum: {
      produzidoKg:   g._sum.pesoProduzido || 0,
      produzidoUn:   g._sum.produzidoUn || 0,
      rejeitado:     g._sum.rejeitadoUn || 0,
      retrabalhado:  0,
      pesoPlanejado: g._sum.pesoPlanejado || 0,
    },
    _count: { productionId: g._count.id || 0 },
    _max:   { dataFim: g._max.dataFim, updatedAt: g._max.updatedAt },
  }));

  const obrasUnicas = [...new Set(grupos.map(g => g.obra))];
  const numerosPortal = [...new Set(obrasUnicas.map(obraParaNumeroOP))];
  const ops = await prisma.oP.findMany({
    where: { numero: { in: numerosPortal } },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  const opMapPorNumero = Object.fromEntries(ops.map(o => [o.numero, o]));
  const opMap = Object.fromEntries(
    obrasUnicas.map(obra => [obra, opMapPorNumero[obraParaNumeroOP(obra)] || null])
  );

  const totais0 = await prisma.mesOrdem.groupBy({
    by: ["obra"],
    where,
    _sum:   { pesoProduzido: true, produzidoUn: true },
    _count: { id: true },
    _max:   { updatedAt: true },
  });
  const totaisMap = Object.fromEntries(totais0.map(t => [t.obra, {
    obra: t.obra,
    _sum: { produzidoKg: t._sum.pesoProduzido || 0, produzidoUn: t._sum.produzidoUn || 0 },
    _count: { productionId: t._count.id || 0 },
    _max: { updatedAt: t._max.updatedAt },
  }]));

  // Status dominante por obra
  const statusGrupos = await prisma.mesOrdem.groupBy({
    by: ["obra", "status"],
    where,
    _count: { id: true },
  });
  const PRIO = { "Produzindo": 4, "Finalizado Total": 3, "Finalizado Parcial": 2, "Finalizado": 1 };
  const statusMap = {};
  for (const row of statusGrupos) {
    const cur = statusMap[row.obra];
    if (row.status && (!cur || (PRIO[row.status] || 0) > (PRIO[cur] || 0))) {
      statusMap[row.obra] = row.status;
    }
  }

  // Não Iniciadas (nível OP): OPs ativas do portal sem nenhuma produção registrada
  const normNum = (o) => { const m = (o || "").match(/^T(\d+)/i); return m ? String(parseInt(m[1])) : ""; };
  const obrasComProducao = new Set(
    grupos.filter(g => (g._sum.produzidoUn || 0) > 0).map(g => normNum(g.obra)).filter(Boolean)
  );
  const opsAtivas = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
    orderBy: { numero: "asc" },
  });
  const naoIniciadas = opsAtivas
    .filter(op => !obrasComProducao.has(String(parseInt(op.numero || "0"))))
    .map(op => ({
      obra:   `T${parseInt(op.numero)}`,
      opInfo: { id: op.id, cliente: op.cliente, obra: op.obra, numero: op.numero },
    }));

  return NextResponse.json({ grupos, opMap, totaisMap, statusMap, naoIniciadas, ultimoSync });
}
