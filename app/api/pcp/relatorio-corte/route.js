// GET /api/pcp/relatorio-corte?obra=&de=&ate=
// Relatório de corte: peças PROGRAMADAS e CORTADAS — APENAS das obras que têm lista
// (LPC / PecaConjunto) no portal. Dados reais do Syneco (MesOrdem, setor Corte):
// planejado × produzido, situação, data/máquina/operador.
//   - sem obra → resumo das obras com LPC
//   - com obra → detalhe por peça
// Casamento Syneco: obra exata (T60B) ou obra-pai + marca (T82A → obra T82, op T82A*).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

const limpo = (v) => (!v || v === "---" ? "—" : v);
function situacao(prog, prod) {
  if (prog > 0 && prod >= prog) return "Cortada";
  if (prod > 0) return "Parcial";
  return "Pendente";
}

const FIELDS = { obra: true, op: true, descItem: true, planejadoUn: true, produzidoUn: true, saldoUn: true, pesoProduzido: true, dataInicio: true, dataFim: true, maquina: true, operador: true };
const mapItem = (r) => ({
  obra: limpo(r.obra),
  peca: limpo(r.op),
  descricao: limpo(r.descItem),
  programado: r.planejadoUn || 0,
  cortado: r.produzidoUn || 0,
  saldo: r.saldoUn || 0,
  situacao: situacao(r.planejadoUn || 0, r.produzidoUn || 0),
  data: r.dataFim,
  maquina: limpo(r.maquina),
  operador: limpo(r.operador),
});

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const url = new URL(req.url);
  const obra = url.searchParams.get("obra");
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");
  const todas = url.searchParams.get("todas"); // extrai TODAS as peças de todas as OPs (flat)

  const base = { setor: { contains: "orte", mode: "insensitive" } };
  if (de || ate) {
    base.dataFim = {};
    if (de) base.dataFim.gte = new Date(`${de}T00:00:00`);
    if (ate) base.dataFim.lte = new Date(`${ate}T23:59:59`);
  }

  // TODAS as peças de todas as OPs, em uma lista só (para extração geral)
  if (todas) {
    const rows = await prisma.mesOrdem.findMany({
      where: base, select: FIELDS, take: 20000,
      orderBy: [{ obra: "asc" }, { dataFim: "desc" }],
    });
    return NextResponse.json({ todas: true, total: rows.length, itens: rows.map(mapItem) });
  }

  // Resumo por OP/frente — TODAS as obras que têm corte no Syneco
  if (!obra) {
    const [grupos, ocultasRows] = await Promise.all([
      prisma.mesOrdem.groupBy({
        by: ["obra"], where: base,
        _sum: { planejadoUn: true, produzidoUn: true, pesoProduzido: true },
        _count: { _all: true }, _max: { dataFim: true },
      }),
      prisma.relatorioCorteObraOculta.findMany({ select: { obra: true } }),
    ]);
    const ocultas = new Set(ocultasRows.map((o) => o.obra));
    const obras = grupos.filter((g) => g.obra).map((g) => {
      const prog = g._sum.planejadoUn || 0, cort = g._sum.produzidoUn || 0;
      return { obra: g.obra, pecas: g._count._all, programadoUn: Math.round(prog), cortadoUn: Math.round(cort), pesoCortado: Math.round(g._sum.pesoProduzido || 0), pct: prog > 0 ? Math.round((cort / prog) * 100) : 0, ultima: g._max.dataFim, oculto: ocultas.has(g.obra) };
    });
    // Ordem numérica da obra, da maior para a menor (T95, T90, T88… ; "1000" no topo).
    const numObra = (s) => { const m = String(s || "").match(/\d+/); return m ? parseInt(m[0], 10) : -1; };
    obras.sort((a, b) => numObra(b.obra) - numObra(a.obra) || String(a.obra).localeCompare(String(b.obra), undefined, { numeric: true }));
    return NextResponse.json({ obras });
  }

  // Detalhe de uma OP — exata; senão obra-pai (T82A → obra T82, op T82A*)
  let rows = await prisma.mesOrdem.findMany({ where: { ...base, obra }, select: FIELDS });
  if (!rows.length) {
    const pai = obra.replace(/[A-Za-z]+$/, "");
    if (pai && pai !== obra) rows = await prisma.mesOrdem.findMany({ where: { ...base, obra: pai, op: { startsWith: obra } }, select: FIELDS });
  }
  rows.sort((a, b) => {
    const da = a.dataFim ? +new Date(a.dataFim) : -1, db = b.dataFim ? +new Date(b.dataFim) : -1;
    return db - da || String(a.op).localeCompare(String(b.op));
  });
  const itens = rows.map(mapItem);
  return NextResponse.json({
    obra,
    total: itens.length,
    cortadas: itens.filter((i) => i.situacao === "Cortada").length,
    parciais: itens.filter((i) => i.situacao === "Parcial").length,
    pendentes: itens.filter((i) => i.situacao === "Pendente").length,
    programadoUn: itens.reduce((s, i) => s + i.programado, 0),
    cortadoUn: itens.reduce((s, i) => s + i.cortado, 0),
    itens,
  });
}
