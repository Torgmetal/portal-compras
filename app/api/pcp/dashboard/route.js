import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const maxDuration = 30;

/**
 * GET /api/pcp/dashboard
 * Retorna dados agregados pra o Dashboard do PCP:
 *  - KG produzido por setor (hoje, semana, mês) — via MesApontamento
 *  - Meta vs Realizado por setor — via ProducaoDiaria
 *  - Pipeline de peças por status — via PecaConjunto
 *  - Produção diária últimos 14 dias — pra gráfico de tendência
 *  - Máquinas ativas agora — via MesApontamento status=Produzindo
 *  - OPs ativas com progresso
 */
export async function GET() {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7)); // segunda
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const inicio14d = new Date(hoje);
  inicio14d.setDate(hoje.getDate() - 14);

  const [
    kgPorSetorHoje,
    kgPorSetorSemana,
    kgPorSetorMes,
    pipelinePecas,
    producaoDiaria14d,
    maquinasAtivas,
    opsAtivas,
    totalPecasAtivas,
    metasSemana,
  ] = await Promise.all([
    // KG por setor hoje
    prisma.mesApontamento.groupBy({
      by: ["setor"],
      where: { dataInicio: { gte: hoje } },
      _sum: { produzidoKg: true, produzidoUn: true },
      _count: true,
    }),

    // KG por setor esta semana
    prisma.mesApontamento.groupBy({
      by: ["setor"],
      where: { dataInicio: { gte: inicioSemana } },
      _sum: { produzidoKg: true, produzidoUn: true },
      _count: true,
    }),

    // KG por setor este mês
    prisma.mesApontamento.groupBy({
      by: ["setor"],
      where: { dataInicio: { gte: inicioMes } },
      _sum: { produzidoKg: true, produzidoUn: true },
      _count: true,
    }),

    // Pipeline de peças — quantas em cada status
    prisma.pecaConjunto.groupBy({
      by: ["status"],
      _count: true,
      _sum: { pesoTotalKg: true },
    }),

    // Produção diária últimos 14 dias (pra gráfico de tendência)
    prisma.mesApontamento.groupBy({
      by: ["setor"],
      where: { dataInicio: { gte: inicio14d } },
      _sum: { produzidoKg: true },
      _count: true,
    }),

    // Máquinas com status Produzindo (ativas agora)
    prisma.mesApontamento.findMany({
      where: { status: "Produzindo" },
      select: {
        setor: true,
        maquina: true,
        codigoMaquina: true,
        obra: true,
        opSka: true,
        descricaoItem: true,
        operador: true,
        dataInicio: true,
        produzidoKg: true,
      },
      orderBy: { dataInicio: "desc" },
    }),

    // OPs ativas (pra mostrar progresso)
    prisma.oP.findMany({
      where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
      select: {
        id: true,
        numero: true,
        cliente: true,
        obra: true,
        _count: { select: { pecasConjunto: true } },
      },
      orderBy: { numero: "desc" },
      take: 20,
    }),

    // Total de peças ativas (PENDENTE a PINTURA, excl. EXPEDIDO)
    prisma.pecaConjunto.count({
      where: { status: { not: "EXPEDIDO" } },
    }),

    // Metas da semana (ProducaoDiaria)
    prisma.producaoDiaria.findMany({
      where: { data: { gte: inicioSemana } },
      select: {
        data: true,
        setor: true,
        pesoMetaKg: true,
        pesoRealizadoKg: true,
        qtdPessoas: true,
      },
      orderBy: { data: "asc" },
    }),
  ]);

  // Busca progresso por OP ativa (peças por status)
  const opsComProgresso = [];
  if (opsAtivas.length > 0) {
    const opIds = opsAtivas.map((o) => o.id);
    const progressoRaw = await prisma.pecaConjunto.groupBy({
      by: ["opId", "status"],
      where: { opId: { in: opIds } },
      _count: true,
      _sum: { pesoTotalKg: true },
    });

    const progressoMap = {};
    for (const p of progressoRaw) {
      if (!p.opId) continue;
      if (!progressoMap[p.opId]) progressoMap[p.opId] = {};
      progressoMap[p.opId][p.status] = {
        count: p._count,
        kg: p._sum.pesoTotalKg || 0,
      };
    }

    for (const op of opsAtivas) {
      const prog = progressoMap[op.id] || {};
      const totalPecas = Object.values(prog).reduce((s, v) => s + v.count, 0);
      const pesoTotalKg = Object.values(prog).reduce((s, v) => s + v.kg, 0);
      const pecasExpedidas = prog.EXPEDIDO?.count || 0;
      opsComProgresso.push({
        numero: op.numero,
        cliente: op.cliente,
        obra: op.obra,
        pesoTotalKg,
        totalPecas,
        pecasExpedidas,
        pctConcluido: totalPecas > 0 ? Math.round((pecasExpedidas / totalPecas) * 100) : 0,
        pipeline: prog,
      });
    }
  }

  // Tendência diária (últimos 14 dias) — agrupa MesApontamento por dia
  const tendenciaRaw = await prisma.$queryRaw`
    SELECT DATE("dataInicio") as dia, setor,
           SUM("produzidoKg") as kg, COUNT(*)::int as apontamentos
    FROM "MesApontamento"
    WHERE "dataInicio" >= ${inicio14d}
    GROUP BY DATE("dataInicio"), setor
    ORDER BY dia ASC
  `;

  // Formata tendência por dia
  const tendenciaDias = {};
  for (const row of tendenciaRaw) {
    const diaStr = new Date(row.dia).toISOString().slice(0, 10);
    if (!tendenciaDias[diaStr]) tendenciaDias[diaStr] = { dia: diaStr, total: 0 };
    const setorKey = (row.setor || "Outros").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
    tendenciaDias[diaStr][setorKey] = Number(row.kg) || 0;
    tendenciaDias[diaStr].total += Number(row.kg) || 0;
  }
  const tendencia = Object.values(tendenciaDias).sort((a, b) => a.dia.localeCompare(b.dia));

  // Deduplica máquinas ativas (pega último apontamento por máquina)
  const maquinaMap = new Map();
  for (const m of maquinasAtivas) {
    const key = `${m.setor}|${m.maquina}`;
    if (!maquinaMap.has(key)) maquinaMap.set(key, m);
  }

  return NextResponse.json({
    kgPorSetor: { hoje: kgPorSetorHoje, semana: kgPorSetorSemana, mes: kgPorSetorMes },
    pipeline: pipelinePecas,
    tendencia,
    maquinasAtivas: [...maquinaMap.values()],
    ops: opsComProgresso,
    totalPecasAtivas,
    metasSemana,
  });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro interno no dashboard" }, { status: 500 });
  }
}
