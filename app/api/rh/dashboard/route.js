import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    const [
      totalFuncionarios,
      totalAtivos,
      totalAfastados,
      totalFerias,
      totalSetores,
      totalCargos,
      porSetor,
      porContrato,
      admissoesRecentes,
      aniversariantes,
      feriasProximas,
    ] = await Promise.all([
      prisma.funcionario.count(),
      prisma.funcionario.count({ where: { status: "ATIVO", ativo: true } }),
      prisma.funcionario.count({ where: { status: "AFASTADO", ativo: true } }),
      prisma.funcionario.count({ where: { status: "FERIAS", ativo: true } }),
      prisma.setor.count({ where: { ativo: true } }),
      prisma.cargo.count({ where: { ativo: true } }),
      // Funcionários por setor
      prisma.funcionario.groupBy({
        by: ["setorId"],
        where: { ativo: true },
        _count: true,
      }),
      // Por tipo de contrato
      prisma.funcionario.groupBy({
        by: ["tipoContrato"],
        where: { ativo: true },
        _count: true,
      }),
      // Admissões nos últimos 30 dias (sem futuro). Busca um pouco mais para
      // depois descartar artefatos de importação (datas carimbadas no import).
      prisma.funcionario.findMany({
        where: {
          dataAdmissao: { gte: new Date(Date.now() - 30 * 86400000), lte: new Date() },
          ativo: true,
        },
        select: { id: true, nome: true, dataAdmissao: true, cargo: { select: { nome: true } }, setor: { select: { nome: true } } },
        orderBy: { dataAdmissao: "desc" },
        take: 40,
      }),
      // Aniversariantes do mês
      prisma.$queryRaw`
        SELECT id, nome, "dataNascimento"
        FROM "Funcionario"
        WHERE ativo = true
          AND "dataNascimento" IS NOT NULL
          AND EXTRACT(MONTH FROM "dataNascimento") = EXTRACT(MONTH FROM NOW())
        ORDER BY EXTRACT(DAY FROM "dataNascimento")
        LIMIT 20
      `,
      // Férias nos próximos 30 dias
      prisma.ferias.findMany({
        where: {
          status: "AGENDADO",
          dataInicio: {
            gte: new Date(),
            lte: new Date(Date.now() + 30 * 86400000),
          },
        },
        select: {
          id: true,
          dataInicio: true,
          dataFim: true,
          diasGozo: true,
          funcionario: { select: { nome: true, setor: { select: { nome: true } } } },
        },
        orderBy: { dataInicio: "asc" },
        take: 10,
      }),
    ]);

    // "Admissões recentes": só datas reais (date-only em UTC meia-noite). Datas com
    // hora ≠ meia-noite vêm de importação que carimbou a data do momento do import
    // (admissão real perdida) — não são admissões recentes de verdade.
    const dataReal = (d) => { const x = new Date(d); return x.getUTCHours() === 0 && x.getUTCMinutes() === 0 && x.getUTCSeconds() === 0; };
    const admissoesRecentesLimpa = admissoesRecentes.filter((f) => f.dataAdmissao && dataReal(f.dataAdmissao)).slice(0, 10);

    // Enriquecer porSetor com nome
    const setores = await prisma.setor.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, sigla: true, cor: true },
    });
    const setorMap = Object.fromEntries(setores.map((s) => [s.id, s]));
    const funcionariosPorSetor = porSetor.map((g) => ({
      setorId: g.setorId,
      nome: setorMap[g.setorId]?.nome || "—",
      sigla: setorMap[g.setorId]?.sigla,
      cor: setorMap[g.setorId]?.cor,
      count: g._count,
    })).sort((a, b) => b.count - a.count);

    // Custo mensal por setor
    const custoSetores = await prisma.funcionario.groupBy({
      by: ["setorId"],
      where: { ativo: true, salario: { not: null } },
      _sum: { salario: true },
      _count: true,
    });
    const custoPorSetor = custoSetores.map((g) => ({
      setorId: g.setorId,
      nome: setorMap[g.setorId]?.nome || "—",
      custoMensal: g._sum.salario || 0,
      qtdFuncionarios: g._count,
    })).sort((a, b) => b.custoMensal - a.custoMensal);

    const custoTotal = custoPorSetor.reduce((s, c) => s + c.custoMensal, 0);

    return NextResponse.json({
      success: true,
      data: {
        totalFuncionarios,
        totalAtivos,
        totalAfastados,
        totalFerias,
        totalSetores,
        totalCargos,
        custoTotal,
        funcionariosPorSetor,
        custoPorSetor,
        porContrato: porContrato.map((g) => ({ tipo: g.tipoContrato, count: g._count })),
        admissoesRecentes: admissoesRecentesLimpa,
        aniversariantes,
        feriasProximas,
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
