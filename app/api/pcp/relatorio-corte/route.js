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

const FIELDS = { op: true, descItem: true, planejadoUn: true, produzidoUn: true, saldoUn: true, pesoProduzido: true, dataInicio: true, dataFim: true, maquina: true, operador: true };

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

  const base = { setor: { contains: "orte", mode: "insensitive" } };
  if (de || ate) {
    base.dataFim = {};
    if (de) base.dataFim.gte = new Date(`${de}T00:00:00`);
    if (ate) base.dataFim.lte = new Date(`${ate}T23:59:59`);
  }

  // Linhas de corte do Syneco para uma obra da LPC: tenta obra exata; senão, obra-pai
  // (sem a sub-letra final) + marca começando com a obra (T82A → obra T82, op T82A*).
  async function corteRows(o) {
    let rows = await prisma.mesOrdem.findMany({ where: { ...base, obra: o }, select: FIELDS });
    if (!rows.length) {
      const pai = o.replace(/[A-Za-z]+$/, "");
      if (pai && pai !== o) rows = await prisma.mesOrdem.findMany({ where: { ...base, obra: pai, op: { startsWith: o } }, select: FIELDS });
    }
    return rows;
  }

  // Obras com lista no portal
  const lpc = await prisma.pecaConjunto.findMany({ distinct: ["opNumero"], select: { opNumero: true } });
  const lpcObras = lpc.map((x) => x.opNumero).filter(Boolean);

  if (!obra) {
    const obras = [];
    for (const o of lpcObras) {
      const rows = await corteRows(o);
      const prog = rows.reduce((s, r) => s + (r.planejadoUn || 0), 0);
      const cort = rows.reduce((s, r) => s + (r.produzidoUn || 0), 0);
      const peso = rows.reduce((s, r) => s + (r.pesoProduzido || 0), 0);
      let ultima = null;
      for (const r of rows) if (r.dataFim && (!ultima || r.dataFim > ultima)) ultima = r.dataFim;
      obras.push({ obra: o, pecas: rows.length, programadoUn: Math.round(prog), cortadoUn: Math.round(cort), pesoCortado: Math.round(peso), pct: prog > 0 ? Math.round((cort / prog) * 100) : 0, ultima });
    }
    obras.sort((a, b) => (b.ultima ? +new Date(b.ultima) : 0) - (a.ultima ? +new Date(a.ultima) : 0));
    return NextResponse.json({ obras });
  }

  // Detalhe — só permite obras da LPC
  if (!lpcObras.includes(obra)) {
    return NextResponse.json({ obra, total: 0, cortadas: 0, parciais: 0, pendentes: 0, programadoUn: 0, cortadoUn: 0, itens: [] });
  }
  const rows = (await corteRows(obra)).sort((a, b) => {
    const da = a.dataFim ? +new Date(a.dataFim) : -1, db = b.dataFim ? +new Date(b.dataFim) : -1;
    return db - da || String(a.op).localeCompare(String(b.op));
  });
  const itens = rows.map((r) => ({
    peca: limpo(r.op),
    descricao: limpo(r.descItem),
    programado: r.planejadoUn || 0,
    cortado: r.produzidoUn || 0,
    saldo: r.saldoUn || 0,
    situacao: situacao(r.planejadoUn || 0, r.produzidoUn || 0),
    data: r.dataFim,
    maquina: limpo(r.maquina),
    operador: limpo(r.operador),
  }));
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
