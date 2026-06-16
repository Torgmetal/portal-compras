// GET /api/pcp/relatorio-corte?obra=&de=&ate=
// Relatório de corte: peças PROGRAMADAS e CORTADAS por obra (MesOrdem do Syneco,
// setor Corte) — planejado × produzido, situação, data/máquina/operador. Fonte real
// (não o kanban manual). Sem obra → resumo por obra; com obra → detalhe por peça.
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

  const where = { setor: { contains: "orte", mode: "insensitive" } };
  // Período filtra pela data do corte (dataFim). Peças ainda não cortadas (sem data)
  // aparecem só sem filtro de período.
  if (de || ate) {
    where.dataFim = {};
    if (de) where.dataFim.gte = new Date(`${de}T00:00:00`);
    if (ate) where.dataFim.lte = new Date(`${ate}T23:59:59`);
  }

  if (!obra) {
    const grp = await prisma.mesOrdem.groupBy({
      by: ["obra"],
      where,
      _sum: { planejadoUn: true, produzidoUn: true, pesoPlanejado: true, pesoProduzido: true },
      _count: { _all: true },
      _max: { dataFim: true },
    });
    const obras = grp
      .map((g) => {
        const prog = Math.round(g._sum.planejadoUn || 0);
        const cort = Math.round(g._sum.produzidoUn || 0);
        return {
          obra: g.obra,
          pecas: g._count._all,
          programadoUn: prog,
          cortadoUn: cort,
          pesoCortado: Math.round(g._sum.pesoProduzido || 0),
          pct: prog > 0 ? Math.round((cort / prog) * 100) : 0,
          ultima: g._max.dataFim,
        };
      })
      .sort((a, b) => (b.ultima ? +new Date(b.ultima) : 0) - (a.ultima ? +new Date(a.ultima) : 0));
    return NextResponse.json({ obras });
  }

  const rows = await prisma.mesOrdem.findMany({
    where: { ...where, obra },
    orderBy: [{ dataFim: { sort: "desc", nulls: "last" } }, { op: "asc" }],
    select: { op: true, descItem: true, planejadoUn: true, produzidoUn: true, saldoUn: true, dataInicio: true, dataFim: true, maquina: true, operador: true },
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
