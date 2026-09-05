// Indicadores da Qualidade (ISO) — calcula cada indicador AUTOMÁTICO a partir do
// dado real do portal (à prova de fraude). Retorna a série mensal do ano + o valor
// do mês selecionado. Os indicadores "pendente" voltam sem valor (precisam de
// registro novo no portal). Ver lib/indicadores-iso.js.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { indicadoresQualidadeIso } from "@/lib/indicadores-qualidade-iso";
import { indicadoresComercialIso } from "@/lib/indicadores-comercial-iso";
import { indicadoresRhIso } from "@/lib/indicadores-rh-iso";
import { indicadoresEngenhariaIso } from "@/lib/indicadores-engenharia-iso";
import { log } from "@/lib/log";

const registroLog = log("api/qualidade/indicadores");

export const runtime = "nodejs";
export const maxDuration = 60;

const MS = 86400000;
const diasUteis = (a, b) => {
  const d0 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const d1 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  let n = Math.round((d1 - d0) / MS);
  if (n <= 0) return 0;
  n = Math.min(n, 400);
  let c = 0;
  for (let i = 1; i <= n; i++) { const w = new Date(d0 + i * MS).getUTCDay(); if (w !== 0 && w !== 6) c++; }
  return c;
};
const uteisNoMes = (ano, m) => { let c = 0; const dim = new Date(Date.UTC(ano, m + 1, 0)).getUTCDate(); for (let d = 1; d <= dim; d++) { const w = new Date(Date.UTC(ano, m, d)).getUTCDay(); if (w !== 0 && w !== 6) c++; } return c; };
const arr12 = () => Array.from({ length: 12 }, () => null);

export async function GET(req) {
  try { await requireRole(["ADMIN", "QUALIDADE", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const hoje = new Date();
  const ano = parseInt(url.searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  let mes = parseInt(url.searchParams.get("mes") ?? "", 10);
  if (Number.isNaN(mes) || mes < 0 || mes > 11) mes = ano === hoje.getUTCFullYear() ? hoje.getUTCMonth() : 11;
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const mesFim = ano < hoje.getUTCFullYear() ? 11 : hoje.getUTCMonth(); // não calcula meses futuros

  const series = {}, acumulados = {}; // id -> [12] · id -> valor acumulado do ano
  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

  // ── Comercial: conversão + ciclo médio de vendas — LIDOS da planilha do Comercial (SharePoint),
  // mesma fonte do painel /comercial/indicadores. Best-effort (não quebra o painel se a planilha falhar).
  try {
    const { indicadores: cInds } = await indicadoresComercialIso(ano);
    for (const ci of cInds) { series[ci.id] = ci.serie; acumulados[ci.id] = ci.acumulado; }
  } catch (e) { registroLog.erro("[qualidade] comercial:", e?.message); }

  // ── Engenharia: prazo do projeto, retrabalho e erros de projeto — via lib, a MESMA do painel
  // /engenharia/indicadores. Duas contas do mesmo indicador divergem na primeira mudança de regra.
  { const { indicadores: eInds } = await indicadoresEngenhariaIso(prisma, ano);
    for (const ei of eInds) { series[ei.id] = ei.serie; acumulados[ei.id] = ei.acumulado; } }

  // ── Compras: retorno de orçamento (média de dias úteis) ──
  { const cot = await prisma.cotacao.findMany({ where: { recebidaEm: { gte: yIni, lt: yFim } }, select: { createdAt: true, recebidaEm: true } });
    const soma = arr12(), n = arr12();
    for (const c of cot) { const m = c.recebidaEm.getUTCMonth(); soma[m] = (soma[m] || 0) + diasUteis(c.createdAt, c.recebidaEm); n[m] = (n[m] || 0) + 1; }
    series.retorno_orcamento = soma.map((v, m) => (n[m] ? Math.round((v / n[m]) * 10) / 10 : null)); }

  // ── Produção: cumprimento dos prazos de fabricação (OP) ──
  { const ops = await prisma.oP.findMany({ where: { dataFimReal: { gte: yIni, lt: yFim }, dataFimPrevista: { not: null } }, select: { dataFimReal: true, dataFimPrevista: true } });
    const ok = arr12(), t = arr12();
    for (const o of ops) { const m = o.dataFimReal.getUTCMonth(); t[m] = (t[m] || 0) + 1; if (o.dataFimReal <= o.dataFimPrevista) ok[m] = (ok[m] || 0) + 1; }
    series.prazo_fabricacao = ok.map((v, m) => pct(v || 0, t[m] || 0)); }

  // ── Qualidade (via lib — mesma fonte do PDF): RNCs do cliente + recorrência + auditorias ──
  { const { indicadores: qInds } = await indicadoresQualidadeIso(prisma, ano);
    for (const qi of qInds) { series[qi.id] = qi.serie; acumulados[qi.id] = qi.acumulado; } }

  // ── RH: turnover + absenteísmo + acidentes com afastamento ──
  const funcs = await prisma.funcionario.findMany({ select: { dataAdmissao: true, dataDemissao: true } });
  const headcount = (m) => { const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1)); return funcs.filter((f) => f.dataAdmissao < fim && (!f.dataDemissao || f.dataDemissao >= ini)).length; };
  { const s = arr12();
    for (let m = 0; m <= mesFim; m++) { const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1)); const adm = funcs.filter((f) => f.dataAdmissao >= ini && f.dataAdmissao < fim).length; const dem = funcs.filter((f) => f.dataDemissao && f.dataDemissao >= ini && f.dataDemissao < fim).length; const hc = headcount(m); s[m] = hc > 0 ? Math.round(((adm + dem) / 2 / hc) * 1000) / 10 : null; }
    series.turnover = s; }
  // ⚠⚠ ABSENTEÍSMO VEM DO CONTROLE DE PRESENÇA DO RH, não dos afastamentos formais. Vitor
  // (27/08/2026): "nessa pasta temos uma informação para preencher o indicador de absenteísmo do
  // RH" — é a `/Qualidade/Presença.xlsx`, o controle diário por setor. A nota do indicador já dizia
  // que o certo era a falta do ponto; até aqui ele contava só `Afastamento`, que registra o
  // afastamento longo e ignora a falta do dia a dia — o grosso do que o indicador mede.
  //
  // ⚠ OS DOIS TIPOS CONTAM (decisão do Vitor, 27/08): falta do dia e afastamento longo no mesmo
  // índice. Sem a planilha (falha de rede, arquivo movido), cai no cálculo antigo em vez de deixar
  // o indicador em branco.
  { let serie = null;
    try {
      const { absenteismoDoAno, serieAbsenteismo } = await import("@/lib/absenteismo-planilha");
      const d = await absenteismoDoAno(ano);
      if (d.achou && d.meses.length) serie = serieAbsenteismo(d);
    } catch (e) { registroLog.erro("[indicadores] absenteísmo pela planilha:", e?.message); }

    if (!serie) {
      const af = await prisma.afastamento.findMany({ where: { dataInicio: { gte: yIni, lt: yFim } }, select: { dataInicio: true, diasAfastado: true } });
      const s2 = arr12();
      for (let m = 0; m <= mesFim; m++) { const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1)); const dias = af.filter((x) => x.dataInicio >= ini && x.dataInicio < fim).reduce((a, x) => a + (x.diasAfastado || 0), 0); const hc = headcount(m); const prev = hc * uteisNoMes(ano, m); s2[m] = prev > 0 ? Math.round((dias / prev) * 1000) / 10 : null; }
      serie = s2;
    }
    series.absenteismo = serie; }

  { const ac = await prisma.acidenteTrabalho.findMany({ where: { data: { gte: yIni, lt: yFim }, tipo: "COM_AFASTAMENTO" }, select: { data: true } });
    const s = arr12(); for (let m = 0; m <= mesFim; m++) s[m] = 0; for (const a of ac) { const m = a.data.getUTCMonth(); if (m <= mesFim) s[m] += 1; }
    series.acidentes_afastamento = s; }


  // ── RH: atendimento das competências — DOCUMENTOS reais + dispensas, via lib de RH (mesma
  // fonte do painel /rh/indicadores). Antes usava a matriz de competências e divergia. ──
  { const { indicadores: rhInds } = await indicadoresRhIso(prisma, ano);
    const at = rhInds.find((i) => i.id === "atendimento_competencias");
    if (at) { series.atendimento_competencias = at.serie; acumulados.atendimento_competencias = at.acumulado; } }

  // Monta a resposta: cada indicador da config + série + valor do mês selecionado.
  const indicadores = INDICADORES_ISO.map((ind) => {
    const serie = series[ind.id] || arr12();
    const atual = serie[mes] ?? null;
    return { ...ind, serie, atual, acumulado: acumulados[ind.id] ?? null };
  });

  return NextResponse.json({ ano, mes, mesFim, indicadores });
}
