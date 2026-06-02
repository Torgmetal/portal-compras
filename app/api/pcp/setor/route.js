import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const maxDuration = 30;

/**
 * GET /api/pcp/setor?setor=Montagem&dias=7
 * Retorna dados de um setor específico:
 *  - Apontamentos recentes (últimos N dias)
 *  - Máquinas do setor (agrupadas)
 *  - Peças no status correspondente ao setor
 *  - Operadores ativos
 *  - KG por dia (tendência)
 */
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
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

  const [apontamentos, maquinas, pecasNoSetor, kgDiario, produzindoAgora] = await Promise.all([
    // Apontamentos recentes
    prisma.mesApontamento.findMany({
      where: {
        setor: { contains: setor, mode: "insensitive" },
        dataInicio: { gte: inicio },
      },
      select: {
        id: true, obra: true, opSka: true, descricaoItem: true,
        setor: true, maquina: true, codigoMaquina: true, operador: true,
        status: true, produzidoKg: true, produzidoUn: true,
        rejeitado: true, retrabalhado: true,
        dataInicio: true, dataFim: true,
      },
      orderBy: { dataInicio: "desc" },
      take: 200,
    }),

    // Máquinas do setor (distinct)
    prisma.mesApontamento.groupBy({
      by: ["maquina", "codigoMaquina"],
      where: {
        setor: { contains: setor, mode: "insensitive" },
        dataInicio: { gte: inicio },
      },
      _sum: { produzidoKg: true, produzidoUn: true },
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

    // KG por dia no setor
    prisma.$queryRaw`
      SELECT DATE("dataInicio") as dia,
             SUM("produzidoKg") as kg,
             SUM("produzidoUn") as un,
             COUNT(*)::int as apontamentos
      FROM "MesApontamento"
      WHERE "setor" ILIKE ${"%" + setor + "%"}
        AND "dataInicio" >= ${inicio}
      GROUP BY DATE("dataInicio")
      ORDER BY dia ASC
    `,

    // Máquinas produzindo agora
    prisma.mesApontamento.findMany({
      where: {
        setor: { contains: setor, mode: "insensitive" },
        status: "Produzindo",
      },
      select: {
        maquina: true, codigoMaquina: true, obra: true, opSka: true,
        descricaoItem: true, operador: true, dataInicio: true, produzidoKg: true,
      },
      orderBy: { dataInicio: "desc" },
    }),
  ]);

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

  // Deduplica máquinas produzindo
  const produzindoMap = new Map();
  for (const m of produzindoAgora) {
    const key = m.maquina || m.codigoMaquina;
    if (!produzindoMap.has(key)) produzindoMap.set(key, m);
  }

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
    produzindoAgora: [...produzindoMap.values()],
    operadores,
  });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro interno" }, { status: 500 });
  }
}
