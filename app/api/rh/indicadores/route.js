// GET /api/rh/indicadores?ano=2026
// Calcula os 6 indicadores de RH:
//   1. Turnover   2. Tempo de Contratacao   3. Absenteismo
//   4. Acidentes  5. Treinamento            6. Custo de Recrutamento
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ROLES = ["ADMIN", "RH"];

export async function GET(req) {
  try {
    await requireRole(ROLES);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") || new Date().getFullYear());
  const inicioAno = new Date(ano, 0, 1);
  const fimAno = new Date(ano, 11, 31, 23, 59, 59, 999);

  // ─── HEADCOUNT BASE (usado em varios indicadores) ──────────
  const headcountInicio = await prisma.funcionario.count({
    where: {
      dataAdmissao: { lte: inicioAno },
      OR: [
        { dataDemissao: null },
        { dataDemissao: { gte: inicioAno } },
      ],
    },
  });

  const headcountFim = await prisma.funcionario.count({
    where: {
      dataAdmissao: { lte: fimAno },
      OR: [
        { dataDemissao: null },
        { dataDemissao: { gte: fimAno } },
      ],
    },
  });

  const headcountMedio = (headcountInicio + headcountFim) / 2;

  // ─── 1. TURNOVER (Taxa de Rotatividade) ────────────────────
  const admissoes = await prisma.funcionario.count({
    where: {
      dataAdmissao: { gte: inicioAno, lte: fimAno },
    },
  });

  const funcionariosDemitidos = await prisma.funcionario.findMany({
    where: {
      dataDemissao: { gte: inicioAno, lte: fimAno },
    },
    select: {
      dataDemissao: true,
      tipoDesligamento: true,
      categoriaDesligamento: true,
    },
  });

  const demissoes = funcionariosDemitidos.length;

  const taxaTurnover =
    headcountMedio > 0
      ? ((admissoes + demissoes) / 2 / headcountMedio) * 100
      : 0;

  // Breakdown por tipo de desligamento
  const porTipoMap = {};
  funcionariosDemitidos.forEach((f) => {
    const t = f.tipoDesligamento || "NAO_INFORMADO";
    porTipoMap[t] = (porTipoMap[t] || 0) + 1;
  });
  const porTipo = Object.entries(porTipoMap).map(([tipo, count]) => ({
    tipo,
    count,
  }));

  // Breakdown por categoria de desligamento
  const porCategoriaMap = {};
  funcionariosDemitidos.forEach((f) => {
    const c = f.categoriaDesligamento || "NAO_INFORMADO";
    porCategoriaMap[c] = (porCategoriaMap[c] || 0) + 1;
  });
  const porCategoria = Object.entries(porCategoriaMap).map(
    ([categoria, count]) => ({ categoria, count })
  );

  // Admissoes e demissoes por mes
  const funcionariosAdmitidos = await prisma.funcionario.findMany({
    where: {
      dataAdmissao: { gte: inicioAno, lte: fimAno },
    },
    select: { dataAdmissao: true },
  });

  const turnoverMensal = Array.from({ length: 12 }, (_, i) => {
    const admMes = funcionariosAdmitidos.filter(
      (f) => new Date(f.dataAdmissao).getMonth() === i
    ).length;
    const demMes = funcionariosDemitidos.filter(
      (f) => new Date(f.dataDemissao).getMonth() === i
    ).length;
    return { mes: i, admissoes: admMes, demissoes: demMes };
  });

  const turnover = {
    taxa: Math.round(taxaTurnover * 10) / 10,
    admissoes,
    demissoes,
    headcountMedio,
    headcountInicio,
    headcountFim,
    porTipo,
    porCategoria,
    mensal: turnoverMensal,
  };

  // ─── 2. TEMPO MEDIO DE CONTRATACAO ─────────────────────────
  const vagasPreenchidas = await prisma.vaga.findMany({
    where: {
      status: "PREENCHIDA",
      dataFechamento: { gte: inicioAno, lte: fimAno },
    },
    include: {
      setor: { select: { nome: true } },
    },
  });

  const vagasAbertas = await prisma.vaga.count({
    where: {
      status: { notIn: ["PREENCHIDA", "CANCELADA"] },
    },
  });

  const detalheVagas = vagasPreenchidas.map((v) => {
    const dataSolicitacao = v.createdAt;
    const dias = Math.max(
      0,
      Math.round(
        (new Date(v.dataFechamento) - new Date(dataSolicitacao)) /
          (1000 * 60 * 60 * 24)
      )
    );
    return {
      id: v.id,
      titulo: v.titulo,
      setor: v.setor?.nome || "Sem setor",
      dias,
      dataSolicitacao,
      dataAprovacao: v.dataAprovacao || null,
      dataPreenchimento: v.dataFechamento,
    };
  });

  const mediaTempo =
    detalheVagas.length > 0
      ? detalheVagas.reduce((s, v) => s + v.dias, 0) / detalheVagas.length
      : 0;

  // Breakdown por setor
  const tempoSetorMap = {};
  detalheVagas.forEach((v) => {
    const setor = v.setor;
    if (!tempoSetorMap[setor])
      tempoSetorMap[setor] = { totalDias: 0, count: 0 };
    tempoSetorMap[setor].totalDias += v.dias;
    tempoSetorMap[setor].count += 1;
  });
  const tempoPorSetor = Object.entries(tempoSetorMap).map(
    ([setor, d]) => ({
      setor,
      media: Math.round((d.totalDias / d.count) * 10) / 10,
      total: d.count,
    })
  );

  const tempoContratacao = {
    media: Math.round(mediaTempo * 10) / 10,
    totalPreenchidas: vagasPreenchidas.length,
    totalAbertas: vagasAbertas,
    porSetor: tempoPorSetor,
    detalhe: detalheVagas,
  };

  // ─── 3. ABSENTEISMO ───────────────────────────────────────
  const afastamentos = await prisma.afastamento.findMany({
    where: {
      OR: [
        { dataInicio: { lte: fimAno }, dataFim: { gte: inicioAno } },
        { dataInicio: { lte: fimAno }, dataFim: null },
      ],
    },
    select: {
      dataInicio: true,
      dataFim: true,
      natureza: true,
      diasAfastado: true,
      status: true,
    },
  });

  const hoje = new Date();
  let diasAfastamento = 0;
  let emAndamento = 0;

  afastamentos.forEach((a) => {
    if (a.status === "EM_ANDAMENTO" && !a.dataFim) {
      emAndamento += 1;
      const inicio = new Date(a.dataInicio);
      const fim = hoje < fimAno ? hoje : fimAno;
      const dias = Math.max(
        0,
        Math.round((fim - inicio) / (1000 * 60 * 60 * 24))
      );
      diasAfastamento += dias;
    } else {
      diasAfastamento += a.diasAfastado || 0;
    }
  });

  const diasUteisPeriodo = headcountMedio * 252;
  const taxaAbsenteismo =
    diasUteisPeriodo > 0 ? (diasAfastamento / diasUteisPeriodo) * 100 : 0;

  // Breakdown por natureza
  const porNaturezaMap = {};
  afastamentos.forEach((a) => {
    const n = a.natureza || "NAO_INFORMADO";
    if (!porNaturezaMap[n]) porNaturezaMap[n] = { count: 0, dias: 0 };
    porNaturezaMap[n].count += 1;
    if (a.status === "EM_ANDAMENTO" && !a.dataFim) {
      const inicio = new Date(a.dataInicio);
      const fim = hoje < fimAno ? hoje : fimAno;
      porNaturezaMap[n].dias += Math.max(
        0,
        Math.round((fim - inicio) / (1000 * 60 * 60 * 24))
      );
    } else {
      porNaturezaMap[n].dias += a.diasAfastado || 0;
    }
  });
  const porNatureza = Object.entries(porNaturezaMap).map(
    ([natureza, d]) => ({ natureza, count: d.count, dias: d.dias })
  );

  // Mensal (por dataInicio)
  const absenteismoMensal = Array.from({ length: 12 }, (_, i) => {
    const mesFiltro = afastamentos.filter(
      (a) => new Date(a.dataInicio).getMonth() === i
    );
    return { mes: i, count: mesFiltro.length };
  });

  const absenteismo = {
    taxa: Math.round(taxaAbsenteismo * 10) / 10,
    diasAfastamento,
    totalAfastamentos: afastamentos.length,
    emAndamento,
    porNatureza,
    mensal: absenteismoMensal,
  };

  // ─── 4. ACIDENTES (Taxa de Frequencia) ─────────────────────
  const acidentesRaw = await prisma.acidenteTrabalho.findMany({
    where: {
      data: { gte: inicioAno, lte: fimAno },
    },
    select: {
      data: true,
      tipo: true,
      gravidade: true,
      diasPerdidos: true,
    },
  });

  const totalAcidentes = acidentesRaw.length;
  const comAfastamento = acidentesRaw.filter(
    (a) => a.tipo === "COM_AFASTAMENTO"
  ).length;
  const semAfastamento = acidentesRaw.filter(
    (a) => a.tipo === "SEM_AFASTAMENTO"
  ).length;
  const trajeto = acidentesRaw.filter(
    (a) => a.tipo === "TRAJETO"
  ).length;
  const quaseAcidentes = acidentesRaw.filter(
    (a) => a.tipo === "QUASE_ACIDENTE"
  ).length;
  const diasPerdidos = acidentesRaw.reduce(
    (s, a) => s + (a.diasPerdidos || 0),
    0
  );

  const hht = headcountMedio * 2000;
  const taxaFrequencia =
    hht > 0 ? (comAfastamento / hht) * 1000000 : 0;
  const taxaGravidade =
    hht > 0 ? (diasPerdidos / hht) * 1000000 : 0;

  // Breakdown por gravidade
  const porGravidadeMap = {};
  acidentesRaw.forEach((a) => {
    const g = a.gravidade || "NAO_INFORMADO";
    porGravidadeMap[g] = (porGravidadeMap[g] || 0) + 1;
  });
  const porGravidade = Object.entries(porGravidadeMap).map(
    ([gravidade, count]) => ({ gravidade, count })
  );

  // Mensal
  const acidentesMensal = Array.from({ length: 12 }, (_, i) => {
    const mesFiltro = acidentesRaw.filter(
      (a) => new Date(a.data).getMonth() === i
    );
    return { mes: i, count: mesFiltro.length };
  });

  const acidentes = {
    totalAcidentes,
    comAfastamento,
    semAfastamento,
    trajeto,
    quaseAcidentes,
    diasPerdidos,
    taxaFrequencia: Math.round(taxaFrequencia * 10) / 10,
    taxaGravidade: Math.round(taxaGravidade * 10) / 10,
    porGravidade,
    mensal: acidentesMensal,
  };

  // ─── 5. TREINAMENTO (Horas per Capita) ─────────────────────
  const treinamentosRaw = await prisma.treinamento.findMany({
    where: {
      dataInicio: { gte: inicioAno, lte: fimAno },
    },
    select: {
      tipo: true,
      cargaHoraria: true,
      custo: true,
      _count: { select: { participantes: true } },
    },
  });

  const totalTreinamentos = treinamentosRaw.length;
  const totalHoras = treinamentosRaw.reduce(
    (s, t) => s + (t.cargaHoraria || 0) * (t._count.participantes || 0),
    0
  );
  const totalParticipacoes = treinamentosRaw.reduce(
    (s, t) => s + (t._count.participantes || 0),
    0
  );
  const horasPerCapita =
    headcountMedio > 0 ? totalHoras / headcountMedio : 0;

  const investimento = treinamentosRaw.reduce(
    (s, t) => s + (t.custo || 0),
    0
  );
  const investimentoPerCapita =
    headcountMedio > 0 ? investimento / headcountMedio : 0;

  // Breakdown por tipo
  const porTipoTreinMap = {};
  treinamentosRaw.forEach((t) => {
    const tp = t.tipo || "NAO_INFORMADO";
    if (!porTipoTreinMap[tp])
      porTipoTreinMap[tp] = { count: 0, horas: 0, participacoes: 0 };
    porTipoTreinMap[tp].count += 1;
    porTipoTreinMap[tp].horas +=
      (t.cargaHoraria || 0) * (t._count.participantes || 0);
    porTipoTreinMap[tp].participacoes += t._count.participantes || 0;
  });
  const porTipoTreinamento = Object.entries(porTipoTreinMap).map(
    ([tipo, d]) => ({ tipo, ...d })
  );

  const treinamento = {
    totalTreinamentos,
    totalHoras: Math.round(totalHoras * 10) / 10,
    horasPerCapita: Math.round(horasPerCapita * 10) / 10,
    investimento: Math.round(investimento * 100) / 100,
    investimentoPerCapita: Math.round(investimentoPerCapita * 100) / 100,
    totalParticipacoes,
    porTipo: porTipoTreinamento,
  };

  // ─── 6. CUSTO DE RECRUTAMENTO ──────────────────────────────
  const custoTotal = vagasPreenchidas.reduce(
    (s, v) => s + (v.custoRecrutamento || 0),
    0
  );
  const custoMedio =
    vagasPreenchidas.length > 0
      ? custoTotal / vagasPreenchidas.length
      : 0;

  // Breakdown por setor
  const custoSetorMap = {};
  vagasPreenchidas.forEach((v) => {
    const setor = v.setor?.nome || "Sem setor";
    if (!custoSetorMap[setor])
      custoSetorMap[setor] = { custo: 0, count: 0 };
    custoSetorMap[setor].custo += v.custoRecrutamento || 0;
    custoSetorMap[setor].count += 1;
  });
  const custoPorSetor = Object.entries(custoSetorMap).map(
    ([setor, d]) => ({
      setor,
      custoTotal: Math.round(d.custo * 100) / 100,
      media:
        d.count > 0 ? Math.round((d.custo / d.count) * 100) / 100 : 0,
      total: d.count,
    })
  );

  const custoRecrutamento = {
    custoTotal: Math.round(custoTotal * 100) / 100,
    custoMedio: Math.round(custoMedio * 100) / 100,
    totalPreenchidas: vagasPreenchidas.length,
    porSetor: custoPorSetor,
  };

  // ─── EVOLUCAO MENSAL ───────────────────────────────────────
  const treinamentosComData = await prisma.treinamento.findMany({
    where: {
      dataInicio: { gte: inicioAno, lte: fimAno },
    },
    select: { dataInicio: true },
  });

  const evolucaoMensal = Array.from({ length: 12 }, (_, i) => ({
    mes: i,
    admissoes: turnoverMensal[i].admissoes,
    demissoes: turnoverMensal[i].demissoes,
    afastamentos: absenteismoMensal[i].count,
    acidentes: acidentesMensal[i].count,
    treinamentos: treinamentosComData.filter(
      (t) => new Date(t.dataInicio).getMonth() === i
    ).length,
  }));

  // ─── NOTA DO SETOR (para card na visao geral) ─────────────
  const notaTurnover = Math.max(
    0,
    Math.min(100, 100 - turnover.taxa * 10)
  );
  const notaAbsenteismo = Math.max(
    0,
    Math.min(100, 100 - (absenteismo.taxa / 6) * 100)
  );
  const notaAcidentes =
    comAfastamento === 0
      ? 100
      : Math.max(0, 100 - comAfastamento * 25);
  const notaTempo = Math.max(
    0,
    Math.min(100, 100 - (tempoContratacao.media / 60) * 100)
  );
  const notaTreinamento = Math.min(
    100,
    (treinamento.horasPerCapita / 20) * 100
  );
  const notaCusto = vagasPreenchidas.length > 0 ? 70 : 0;

  const notaGeral =
    notaTurnover * 0.25 +
    notaAbsenteismo * 0.2 +
    notaAcidentes * 0.2 +
    notaTempo * 0.15 +
    notaTreinamento * 0.1 +
    notaCusto * 0.1;

  const notaSetor = {
    nota: Math.round(notaGeral * 10) / 10,
    indicadores: [
      {
        id: "turnover",
        label: "Turnover",
        nota: Math.round(notaTurnover * 10) / 10,
        peso: 0.25,
      },
      {
        id: "absenteismo",
        label: "Absenteismo",
        nota: Math.round(notaAbsenteismo * 10) / 10,
        peso: 0.2,
      },
      {
        id: "acidentes",
        label: "Acidentes",
        nota: Math.round(notaAcidentes * 10) / 10,
        peso: 0.2,
      },
      {
        id: "tempo",
        label: "Tempo Contratacao",
        nota: Math.round(notaTempo * 10) / 10,
        peso: 0.15,
      },
      {
        id: "treinamento",
        label: "Treinamento",
        nota: Math.round(notaTreinamento * 10) / 10,
        peso: 0.1,
      },
      {
        id: "custo",
        label: "Custo Recrutamento",
        nota: Math.round(notaCusto * 10) / 10,
        peso: 0.1,
      },
    ],
  };

  return NextResponse.json({
    success: true,
    ano,
    notaSetor,
    turnover,
    tempoContratacao,
    absenteismo,
    acidentes,
    treinamento,
    custoRecrutamento,
    evolucaoMensal,
  });
}
