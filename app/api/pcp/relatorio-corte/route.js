// GET /api/pcp/relatorio-corte?obra=&de=&ate=
// Relatório de rastreabilidade de CORTE: peças cortadas (apontamentos do Syneco,
// setor Corte) por obra/OP, com data/hora, máquina e operador. Fonte = MesApontamento
// (registro real da máquina), não o kanban manual.
//   - sem obra → resumo por obra (peças, peso, último corte)
//   - com obra → detalhe (cada peça cortada com data/máquina/operador)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  // setor "Corte" (insensitive, pega variações tipo "Corte Laser")
  const where = { setor: { contains: "orte", mode: "insensitive" } };
  if (de || ate) {
    where.dataFim = {};
    if (de) where.dataFim.gte = new Date(`${de}T00:00:00`);
    if (ate) where.dataFim.lte = new Date(`${ate}T23:59:59`);
  }

  if (!obra) {
    const grp = await prisma.mesApontamento.groupBy({
      by: ["obra"],
      where,
      _sum: { produzidoUn: true, produzidoKg: true },
      _count: { _all: true },
      _max: { dataFim: true },
    });
    const obras = grp
      .map((g) => ({
        obra: g.obra,
        apontamentos: g._count._all,
        pecas: Math.round(g._sum.produzidoUn || 0),
        kg: Math.round(g._sum.produzidoKg || 0),
        ultima: g._max.dataFim,
      }))
      .sort((a, b) => (b.ultima ? +new Date(b.ultima) : 0) - (a.ultima ? +new Date(a.ultima) : 0));
    return NextResponse.json({ obras });
  }

  const rows = await prisma.mesApontamento.findMany({
    where: { ...where, obra },
    orderBy: { dataFim: "desc" },
    select: { opSka: true, descricaoItem: true, produzidoUn: true, produzidoKg: true, dataInicio: true, dataFim: true, maquina: true, operador: true },
  });
  const itens = rows.map((r) => ({
    peca: r.opSka || "—",
    descricao: r.descricaoItem || "—",
    un: r.produzidoUn || 0,
    kg: Math.round(r.produzidoKg || 0),
    data: r.dataFim || r.dataInicio,
    maquina: r.maquina || "—",
    operador: r.operador || "—",
  }));
  return NextResponse.json({
    obra,
    total: itens.length,
    totalUn: Math.round(itens.reduce((s, i) => s + i.un, 0)),
    totalKg: itens.reduce((s, i) => s + i.kg, 0),
    itens,
  });
}
