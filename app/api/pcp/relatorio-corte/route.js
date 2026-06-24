// GET /api/pcp/relatorio-corte?setor=&obra=&de=&ate=
// Relatório de produção por setor: peças PROGRAMADAS e PRODUZIDAS no setor —
// dados reais do Syneco (MesOrdem): planejado × produzido, situação, data/máquina/operador.
//   - setor: CORTE (padrão) | MONTAGEM | SOLDA | ACABAMENTO | JATO | PINTURA
//   - sem obra → resumo das obras com apontamento no setor
//   - com obra → detalhe por peça
// Casamento Syneco: obra exata (T60B) ou obra-pai + marca (T82A → obra T82, op T82A*).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { whereSetorSyneco } from "@/lib/syneco-dia";

export const runtime = "nodejs";
export const maxDuration = 30;

const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
// Particípio de "concluído no setor" usado na situação da peça.
const VERBO_SETOR = { CORTE: "Cortada", MONTAGEM: "Montada", SOLDA: "Soldada", ACABAMENTO: "Acabada", JATO: "Jateada", PINTURA: "Pintada" };
const LABEL_ESTADO = { PARCIAL: "Parcial", PENDENTE: "Pendente" };

const limpo = (v) => (!v || v === "---" ? "—" : v);
function estadoDe(prog, prod) {
  if (prog > 0 && prod >= prog) return "FEITO";
  if (prod > 0) return "PARCIAL";
  return "PENDENTE";
}

const FIELDS = { obra: true, op: true, descItem: true, planejadoUn: true, produzidoUn: true, saldoUn: true, pesoProduzido: true, dataInicio: true, dataFim: true, maquina: true, operador: true };
const mapItem = (r, verbo) => {
  const estado = estadoDe(r.planejadoUn || 0, r.produzidoUn || 0);
  return {
    obra: limpo(r.obra),
    peca: limpo(r.op),
    descricao: limpo(r.descItem),
    programado: r.planejadoUn || 0,
    cortado: r.produzidoUn || 0, // produzido no setor (nome mantido p/ o client)
    saldo: r.saldoUn || 0,
    estado,
    situacao: estado === "FEITO" ? verbo : LABEL_ESTADO[estado],
    data: r.dataFim,
    maquina: limpo(r.maquina),
    operador: limpo(r.operador),
  };
};

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const url = new URL(req.url);
  const setorParam = (url.searchParams.get("setor") || "CORTE").toUpperCase();
  const setor = SETORES.includes(setorParam) ? setorParam : "CORTE";
  const verbo = VERBO_SETOR[setor];
  const obra = url.searchParams.get("obra");
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");
  const todas = url.searchParams.get("todas"); // extrai TODAS as peças de todas as OPs (flat)

  const base = whereSetorSyneco(setor);
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
    return NextResponse.json({ todas: true, setor, total: rows.length, itens: rows.map((r) => mapItem(r, verbo)) });
  }

  // Resumo por OP/frente — TODAS as obras que têm apontamento no setor
  if (!obra) {
    const [grupos, ocultasRows] = await Promise.all([
      prisma.mesOrdem.groupBy({
        by: ["obra"], where: base,
        _sum: { planejadoUn: true, produzidoUn: true, pesoProduzido: true },
        _count: { _all: true }, _max: { dataFim: true },
      }),
      prisma.relatorioCorteObraOculta.findMany({ where: { setor }, select: { obra: true } }),
    ]);
    const ocultas = new Set(ocultasRows.map((o) => o.obra));
    const obras = grupos.filter((g) => g.obra).map((g) => {
      const prog = g._sum.planejadoUn || 0, cort = g._sum.produzidoUn || 0;
      return { obra: g.obra, pecas: g._count._all, programadoUn: Math.round(prog), cortadoUn: Math.round(cort), pesoCortado: Math.round(g._sum.pesoProduzido || 0), pct: prog > 0 ? Math.round((cort / prog) * 100) : 0, ultima: g._max.dataFim, oculto: ocultas.has(g.obra) };
    });
    // Ordem numérica da obra, da maior para a menor (T95, T90, T88… ; "1000" no topo).
    const numObra = (s) => { const m = String(s || "").match(/\d+/); return m ? parseInt(m[0], 10) : -1; };
    obras.sort((a, b) => numObra(b.obra) - numObra(a.obra) || String(a.obra).localeCompare(String(b.obra), undefined, { numeric: true }));
    return NextResponse.json({ setor, obras });
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
  const itens = rows.map((r) => mapItem(r, verbo));
  return NextResponse.json({
    setor,
    obra,
    total: itens.length,
    cortadas: itens.filter((i) => i.estado === "FEITO").length,
    parciais: itens.filter((i) => i.estado === "PARCIAL").length,
    pendentes: itens.filter((i) => i.estado === "PENDENTE").length,
    programadoUn: itens.reduce((s, i) => s + i.programado, 0),
    cortadoUn: itens.reduce((s, i) => s + i.cortado, 0),
    itens,
  });
}
