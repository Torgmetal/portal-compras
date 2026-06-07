import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const maxDuration = 30;

/**
 * GET /api/pcp/dashboard
 * Retorna dados agregados pra o Dashboard do PCP:
 *  - KG produzido por setor (hoje, semana, mês) — via MesOrdem
 *  - Meta vs Realizado por setor — via ProducaoDiaria
 *  - Pipeline de peças por status — via PecaConjunto
 *  - Produção diária últimos 14 dias — pra gráfico de tendência
 *  - Máquinas (último estado de cada) — via MesOrdem
 *  - OPs ativas com progresso
 *
 * NOTA: migrado de MesApontamento → MesOrdem em jun/2026.
 *   MesOrdem é alimentada pelo sync-agent (dataset 150, snapshot).
 *   Campo de peso: pesoProduzido (não produzidoKg).
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
    maquinasAtivas,
    opsAtivas,
    totalPecasAtivas,
    metasSemana,
  ] = await Promise.all([
    // KG por setor hoje
    prisma.mesOrdem.groupBy({
      by: ["setor"],
      where: { dataInicio: { gte: hoje }, pesoProduzido: { gt: 0 } },
      _sum: { pesoProduzido: true, produzidoUn: true },
      _count: true,
    }),

    // KG por setor esta semana
    prisma.mesOrdem.groupBy({
      by: ["setor"],
      where: { dataInicio: { gte: inicioSemana }, pesoProduzido: { gt: 0 } },
      _sum: { pesoProduzido: true, produzidoUn: true },
      _count: true,
    }),

    // KG por setor este mês
    prisma.mesOrdem.groupBy({
      by: ["setor"],
      where: { dataInicio: { gte: inicioMes }, pesoProduzido: { gt: 0 } },
      _sum: { pesoProduzido: true, produzidoUn: true },
      _count: true,
    }),

    // Pipeline de peças — quantas em cada status
    prisma.pecaConjunto.groupBy({
      by: ["status"],
      _count: true,
      _sum: { pesoTotalKg: true },
    }),

    // Último registro de cada máquina (todas, via MesOrdem)
    prisma.$queryRaw`
      SELECT DISTINCT ON (maquina, setor)
        setor, maquina, obra, op as "opSka",
        "descItem" as "descricaoItem", operador, status,
        "dataInicio", "pesoProduzido" as "produzidoKg"
      FROM "MesOrdem"
      WHERE maquina IS NOT NULL AND maquina != '' AND maquina != '---'
      ORDER BY maquina, setor, "dataInicio" DESC
    `,

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

  // Tendência diária (últimos 14 dias) — via MesOrdem
  const tendenciaRaw = await prisma.$queryRaw`
    SELECT DATE("dataInicio") as dia, setor,
           SUM("pesoProduzido") as kg, COUNT(*)::int as apontamentos
    FROM "MesOrdem"
    WHERE "dataInicio" >= ${inicio14d}
      AND "pesoProduzido" > 0
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

  // Normaliza KG por setor (adapta campo pesoProduzido → produzidoKg pra manter compatibilidade do front)
  const adaptKg = (arr) =>
    arr.map((r) => ({
      setor: r.setor,
      _sum: { produzidoKg: r._sum.pesoProduzido || 0, produzidoUn: r._sum.produzidoUn || 0 },
      _count: r._count,
    }));

  // Normaliza resultado $queryRaw de máquinas
  const maquinasList = maquinasAtivas.map((m) => ({
    setor: m.setor,
    maquina: m.maquina,
    codigoMaquina: null,
    obra: m.obra,
    opSka: m.opSka,
    descricaoItem: m.descricaoItem,
    operador: m.operador,
    status: m.status,
    dataInicio: m.dataInicio,
    produzidoKg: Number(m.produzidoKg) || 0,
  }));

  return NextResponse.json({
    kgPorSetor: { hoje: adaptKg(kgPorSetorHoje), semana: adaptKg(kgPorSetorSemana), mes: adaptKg(kgPorSetorMes) },
    pipeline: pipelinePecas,
    tendencia,
    maquinasAtivas: maquinasList,
    ops: opsComProgresso,
    totalPecasAtivas,
    metasSemana,
  });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro interno no dashboard" }, { status: 500 });
  }
}
