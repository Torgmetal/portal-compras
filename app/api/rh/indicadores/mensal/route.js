// GET /api/rh/indicadores/mensal?ano=YYYY
// RH MÊS A MÊS + acumulado (YTD): admissões, demissões, turnover%, afastamentos
// (qtd/dias), acidentes, treinamentos (qtd/horas) e contratações (qtd/tempo).
// Nota do mês = turnover + absenteísmo + acidentes (os que traduzem bem pra mês;
// treinamento/custo têm meta anual, ficam só como número). Busca o ano uma vez.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const round = (n) => Math.round((n || 0) * 10) / 10;
const mesDe = (d) => new Date(d).getMonth(); // 0-11 (data local do registro)
function diasUteisMes(ano, mes /*1-12*/, agora) {
  const ultimo = new Date(ano, mes, 0).getDate();
  let ate = ultimo;
  if (ano === agora.getFullYear() && mes === agora.getMonth() + 1) ate = agora.getDate();
  let n = 0;
  for (let d = 1; d <= ate; d++) { const w = new Date(ano, mes - 1, d).getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export async function GET(req) {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  try {
    const { searchParams } = new URL(req.url);
    const agora = new Date();
    const p = parseInt(searchParams.get("ano"), 10);
    const ano = p >= 2020 && p <= 2100 ? p : agora.getFullYear();
    const ultimoMes = ano === agora.getFullYear() ? agora.getMonth() + 1 : 12;
    const inicioAno = new Date(ano, 0, 1);
    const fimAno = new Date(ano, 11, 31, 23, 59, 59, 999);

    // headcount médio do ano (base dos denominadores) — igual ao anual
    const [hcIni, hcFim] = await Promise.all([
      prisma.funcionario.count({ where: { dataAdmissao: { lte: inicioAno }, OR: [{ dataDemissao: null }, { dataDemissao: { gte: inicioAno } }] } }),
      prisma.funcionario.count({ where: { dataAdmissao: { lte: fimAno }, OR: [{ dataDemissao: null }, { dataDemissao: { gte: fimAno } }] } }),
    ]);
    const headcountMedio = (hcIni + hcFim) / 2 || 1;

    // dados do ano (uma vez cada)
    const [admitidos, demitidos, afastamentos, acidentes, treinos, vagas] = await Promise.all([
      prisma.funcionario.findMany({ where: { dataAdmissao: { gte: inicioAno, lte: fimAno } }, select: { dataAdmissao: true } }),
      prisma.funcionario.findMany({ where: { dataDemissao: { gte: inicioAno, lte: fimAno } }, select: { dataDemissao: true } }),
      prisma.afastamento.findMany({ where: { dataInicio: { gte: inicioAno, lte: fimAno } }, select: { dataInicio: true, dataFim: true, diasAfastado: true, status: true } }),
      prisma.acidenteTrabalho.findMany({ where: { data: { gte: inicioAno, lte: fimAno } }, select: { data: true, tipo: true } }),
      prisma.treinamento.findMany({ where: { dataInicio: { gte: inicioAno, lte: fimAno } }, select: { dataInicio: true, cargaHoraria: true, _count: { select: { participantes: true } } } }),
      prisma.vaga.findMany({ where: { status: "PREENCHIDA", dataFechamento: { gte: inicioAno, lte: fimAno } }, select: { dataFechamento: true, createdAt: true } }),
    ]);

    const B = Array.from({ length: 12 }, () => ({ adm: 0, dem: 0, afast: 0, dias: 0, acid: 0, acidCA: 0, trein: 0, horas: 0, vagas: 0, tempoSoma: 0 }));
    for (const f of admitidos) B[mesDe(f.dataAdmissao)].adm++;
    for (const f of demitidos) B[mesDe(f.dataDemissao)].dem++;
    for (const a of afastamentos) {
      const b = B[mesDe(a.dataInicio)]; b.afast++;
      let dias = a.diasAfastado || 0;
      if (a.status === "EM_ANDAMENTO" && !a.dataFim) { const fim = agora < fimAno ? agora : fimAno; dias = Math.max(0, Math.round((fim - new Date(a.dataInicio)) / 86400000)); }
      b.dias += dias;
    }
    for (const a of acidentes) { const b = B[mesDe(a.data)]; b.acid++; if (a.tipo === "COM_AFASTAMENTO") b.acidCA++; }
    for (const t of treinos) { const b = B[mesDe(t.dataInicio)]; b.trein++; b.horas += (t.cargaHoraria || 0) * (t._count.participantes || 0); }
    for (const v of vagas) { const b = B[mesDe(v.dataFechamento)]; b.vagas++; b.tempoSoma += Math.max(0, Math.round((new Date(v.dataFechamento) - new Date(v.createdAt)) / 86400000)); }

    const meses = [];
    const acc = { adm: 0, dem: 0, afast: 0, dias: 0, acid: 0, acidCA: 0, trein: 0, horas: 0, vagas: 0, tempoSoma: 0, du: 0 };
    for (let m = 1; m <= ultimoMes; m++) {
      const b = B[m - 1];
      const du = diasUteisMes(ano, m, agora);
      const turnoverPct = ((b.adm + b.dem) / 2 / headcountMedio) * 100;
      const absPct = du > 0 ? (b.dias / (headcountMedio * du)) * 100 : 0;
      const notaTurnover = Math.max(0, Math.min(100, 100 - turnoverPct * 10));
      const notaAbs = Math.max(0, Math.min(100, 100 - (absPct / 6) * 100));
      const notaAcid = b.acidCA === 0 ? 100 : Math.max(0, 100 - b.acidCA * 25);
      const nota = notaTurnover * 0.4 + notaAbs * 0.32 + notaAcid * 0.28; // renormalizado (0.25/0.2/0.2)
      meses.push({
        mes: m, admissoes: b.adm, demissoes: b.dem, turnoverPct: round(turnoverPct),
        afastamentos: b.afast, diasAfastamento: b.dias, absenteismoPct: round(absPct),
        acidentes: b.acid, acidentesComAfast: b.acidCA,
        treinamentos: b.trein, horasTreinamento: Math.round(b.horas),
        contratacoes: b.vagas, tempoMedioContratacao: b.vagas > 0 ? Math.round(b.tempoSoma / b.vagas) : null,
        nota: Math.round(nota * 10) / 10,
      });
      for (const k of Object.keys(acc)) if (k !== "du") acc[k] += b[k]; acc.du += du;
    }

    const turnoverAcc = ((acc.adm + acc.dem) / 2 / headcountMedio) * 100;
    const absAcc = acc.du > 0 ? (acc.dias / (headcountMedio * acc.du)) * 100 : 0;
    const notaTAcc = Math.max(0, Math.min(100, 100 - turnoverAcc * 10));
    const notaAbsAcc = Math.max(0, Math.min(100, 100 - (absAcc / 6) * 100));
    const notaAcidAcc = acc.acidCA === 0 ? 100 : Math.max(0, 100 - acc.acidCA * 25);
    const acumulado = {
      admissoes: acc.adm, demissoes: acc.dem, turnoverPct: round(turnoverAcc),
      afastamentos: acc.afast, diasAfastamento: acc.dias, absenteismoPct: round(absAcc),
      acidentes: acc.acid, acidentesComAfast: acc.acidCA,
      treinamentos: acc.trein, horasTreinamento: Math.round(acc.horas),
      contratacoes: acc.vagas, tempoMedioContratacao: acc.vagas > 0 ? Math.round(acc.tempoSoma / acc.vagas) : null,
      nota: Math.round((notaTAcc * 0.4 + notaAbsAcc * 0.32 + notaAcidAcc * 0.28) * 10) / 10,
    };

    return NextResponse.json({ success: true, ano, headcountMedio: Math.round(headcountMedio), meses, acumulado });
  } catch (e) {
    console.error("indicadores RH mensal:", e?.message || e);
    return NextResponse.json({ success: false, error: "Falha ao calcular a evolução mensal do RH." }, { status: 500 });
  }
}
