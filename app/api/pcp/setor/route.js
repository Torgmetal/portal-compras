import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const maxDuration = 30;

/**
 * GET /api/pcp/setor?setor=Montagem&dias=7
 * Retorna dados de um setor específico (fonte: MesOrdem):
 *  - Apontamentos recentes (últimos N dias)
 *  - Máquinas do setor (último estado de cada)
 *  - Peças no status correspondente ao setor
 *  - Operadores ativos
 *  - KG por dia (tendência)
 *
 * NOTA: migrado de MesApontamento → MesOrdem em jun/2026.
 *   MesOrdem usa pesoProduzido (não produzidoKg), descItem (não descricaoItem),
 *   op (não opSka). O response normaliza pra manter compatibilidade do front.
 */
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {
  const { searchParams } = new URL(req.url);
  const setor = searchParams.get("setor");
  const dias = Math.min(Number(searchParams.get("dias")) || 7, 30);

  if (!setor) {
    return NextResponse.json({ error: "Parâmetro 'setor' obrigatório" }, { status: 400 });
  }

  const inicio = new Date();
  inicio.setDate(inicio.getDate() - dias);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Status de PecaConjunto correspondente ao setor
  const statusMap = {
    corte: "CORTE", dobra: "CORTE", montagem: "MONTAGEM", solda: "SOLDA",
    acabamento: "ACABAMENTO", jato: "JATO", pintura: "PINTURA", expedicao: "EXPEDIDO",
  };
  const setorNorm = setor.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  const statusPeca = statusMap[setorNorm] || null;

  const [apontamentosRaw, maquinasRaw, pecasNoSetor, kgDiario, maquinasUltimo] = await Promise.all([
    // Apontamentos recentes (via MesOrdem)
    prisma.mesOrdem.findMany({
      where: {
        setor: { contains: setor, mode: "insensitive" },
        dataInicio: { gte: inicio },
        pesoProduzido: { gt: 0 },
      },
      select: {
        id: true, obra: true, op: true, descItem: true,
        setor: true, maquina: true, operador: true,
        status: true, pesoProduzido: true, produzidoUn: true,
        rejeitadoUn: true, planejadoUn: true,
        dataInicio: true, dataFim: true,
      },
      orderBy: { dataInicio: "desc" },
      take: 200,
    }),

    // Máquinas do setor (distinct) — produção acumulada no período
    prisma.mesOrdem.groupBy({
      by: ["maquina"],
      where: {
        setor: { contains: setor, mode: "insensitive" },
        dataInicio: { gte: inicio },
        maquina: { not: null },
        pesoProduzido: { gt: 0 },
      },
      _sum: { pesoProduzido: true, produzidoUn: true },
      _count: true,
    }),

    // Peças no status correspondente ao setor
    statusPeca
      ? prisma.pecaConjunto.findMany({
          where: { status: statusPeca },
          select: {
            id: true, opNumero: true, marca: true, descricao: true,
            qte: true, pesoUnitKg: true, pesoTotalKg: true,
            ultimoSetor: true, dataPrevista: true,
          },
          orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
          take: 200,
        })
      : [],

    // KG por dia no setor (via MesOrdem)
    prisma.$queryRaw`
      SELECT DATE("dataInicio") as dia,
             SUM("pesoProduzido") as kg,
             SUM("produzidoUn")::int as un,
             COUNT(*)::int as apontamentos
      FROM "MesOrdem"
      WHERE "setor" ILIKE ${"%" + setor + "%"}
        AND "dataInicio" >= ${inicio}
        AND "pesoProduzido" > 0
      GROUP BY DATE("dataInicio")
      ORDER BY dia ASC
    `,

    // Último registro de cada máquina do setor (via MesOrdem)
    prisma.$queryRaw`
      SELECT DISTINCT ON (maquina)
        maquina, obra, op as "opSka",
        "descItem" as "descricaoItem", operador, status,
        "dataInicio", "pesoProduzido" as "produzidoKg"
      FROM "MesOrdem"
      WHERE setor ILIKE ${"%" + setor + "%"}
        AND maquina IS NOT NULL AND maquina != '' AND maquina != '---'
      ORDER BY maquina, "dataInicio" DESC
    `,
  ]);

  // Normaliza apontamentos pra manter compatibilidade do front
  const apontamentos = apontamentosRaw.map((a) => ({
    id: a.id,
    obra: a.obra,
    opSka: a.op,
    descricaoItem: a.descItem,
    setor: a.setor,
    maquina: a.maquina,
    codigoMaquina: null,
    operador: a.operador,
    status: a.status,
    produzidoKg: a.pesoProduzido || 0,
    produzidoUn: a.produzidoUn || 0,
    rejeitado: a.rejeitadoUn || 0,
    retrabalhado: 0,
    dataInicio: a.dataInicio,
    dataFim: a.dataFim,
  }));

  // Normaliza máquinas agrupadas
  const maquinas = maquinasRaw.map((m) => ({
    maquina: m.maquina,
    codigoMaquina: null,
    _sum: { produzidoKg: m._sum.pesoProduzido || 0, produzidoUn: m._sum.produzidoUn || 0 },
    _count: m._count,
  }));

  // Operadores do setor (últimos N dias)
  const operadoresMap = new Map();
  for (const a of apontamentos) {
    if (!a.operador) continue;
    const key = a.operador;
    if (!operadoresMap.has(key)) {
      operadoresMap.set(key, { nome: a.operador, kg: 0, apontamentos: 0 });
    }
    const op = operadoresMap.get(key);
    op.kg += a.produzidoKg || 0;
    op.apontamentos += 1;
  }
  const operadores = [...operadoresMap.values()].sort((a, b) => b.kg - a.kg);

  // KG hoje
  const kgHoje = apontamentos
    .filter((a) => new Date(a.dataInicio) >= hoje)
    .reduce((s, a) => s + (a.produzidoKg || 0), 0);

  // Normaliza resultado $queryRaw de máquinas
  const todasMaquinas = maquinasUltimo
    .map((m) => ({
      maquina: m.maquina,
      codigoMaquina: null,
      obra: m.obra,
      opSka: m.opSka,
      descricaoItem: m.descricaoItem,
      operador: m.operador,
      status: m.status,
      dataInicio: m.dataInicio,
      produzidoKg: Number(m.produzidoKg) || 0,
    }))
    .sort((a, b) => (a.maquina || "").localeCompare(b.maquina || ""));

  return NextResponse.json({
    setor,
    kgHoje,
    apontamentos,
    maquinas,
    pecasNoSetor,
    kgDiario: kgDiario.map((r) => ({
      dia: new Date(r.dia).toISOString().slice(0, 10),
      kg: Number(r.kg) || 0,
      un: Number(r.un) || 0,
      apontamentos: r.apontamentos,
    })),
    produzindoAgora: todasMaquinas,
    operadores,
  });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro interno" }, { status: 500 });
  }
}
