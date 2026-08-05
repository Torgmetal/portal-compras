// Indicadores da Qualidade (ISO) — calcula cada indicador AUTOMÁTICO a partir do
// dado real do portal (à prova de fraude). Retorna a série mensal do ano + o valor
// do mês selecionado. Os indicadores "pendente" voltam sem valor (precisam de
// registro novo no portal). Ver lib/indicadores-iso.js.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { INDICADORES_ISO } from "@/lib/indicadores-iso";

export const runtime = "nodejs";

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
const AUD_OK = new Set(["REALIZADA", "EMITIDO", "FINALIZADO"]);

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

  const series = {}; // id -> [12]
  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

  // ── Comercial: conversão + aderência do prazo da proposta ──
  const orcs = await prisma.orcamento.findMany({ where: { OR: [{ dataFechamento: { gte: yIni, lt: yFim } }, { dataEnvio: { gte: yIni, lt: yFim } }] }, select: { status: true, dataFechamento: true, dataEnvio: true, dataSolicitada: true } });
  { const f = arr12(), t = arr12(); // conversão
    for (const o of orcs) { if (!o.dataFechamento || o.dataFechamento < yIni || o.dataFechamento >= yFim) continue; if (o.status !== "FECHADA" && o.status !== "PERDIDA") continue; const m = o.dataFechamento.getUTCMonth(); t[m] = (t[m] || 0) + 1; if (o.status === "FECHADA") f[m] = (f[m] || 0) + 1; }
    series.conversao_propostas = f.map((v, m) => pct(v || 0, t[m] || 0)); }
  { const ok = arr12(), t = arr12(); const PRAZO = 5; // aderência prazo proposta (≤5 dias úteis)
    for (const o of orcs) { if (!o.dataEnvio || !o.dataSolicitada || o.dataEnvio < yIni || o.dataEnvio >= yFim) continue; const m = o.dataEnvio.getUTCMonth(); t[m] = (t[m] || 0) + 1; if (diasUteis(o.dataSolicitada, o.dataEnvio) <= PRAZO) ok[m] = (ok[m] || 0) + 1; }
    series.aderencia_prazo_proposta = ok.map((v, m) => pct(v || 0, t[m] || 0)); }

  // ── Engenharia: aderência do prazo do projeto (cronograma) ──
  { const tar = await prisma.cronogramaTarefa.findMany({ where: { departamento: "ENGENHARIA", dataFimReal: { gte: yIni, lt: yFim }, dataFimPrevista: { not: null } }, select: { dataFimReal: true, dataFimPrevista: true } });
    const ok = arr12(), t = arr12();
    for (const x of tar) { const m = x.dataFimReal.getUTCMonth(); t[m] = (t[m] || 0) + 1; if (x.dataFimReal <= x.dataFimPrevista) ok[m] = (ok[m] || 0) + 1; }
    series.aderencia_prazo_projeto = ok.map((v, m) => pct(v || 0, t[m] || 0)); }

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

  // ── Qualidade: cumprimento do plano de auditorias internas ──
  { const aud = await prisma.auditoriaInterna.findMany({ where: { dataAuditoria: { gte: yIni, lt: yFim } }, select: { dataAuditoria: true, status: true } });
    const real = arr12(), plan = arr12();
    for (const a of aud) { const m = a.dataAuditoria.getUTCMonth(); plan[m] = (plan[m] || 0) + 1; if (AUD_OK.has(a.status)) real[m] = (real[m] || 0) + 1; }
    series.plano_auditorias = real.map((v, m) => pct(v || 0, plan[m] || 0)); }

  // ── RH: turnover + absenteísmo + acidentes com afastamento ──
  const funcs = await prisma.funcionario.findMany({ select: { dataAdmissao: true, dataDemissao: true } });
  const headcount = (m) => { const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1)); return funcs.filter((f) => f.dataAdmissao < fim && (!f.dataDemissao || f.dataDemissao >= ini)).length; };
  { const s = arr12();
    for (let m = 0; m <= mesFim; m++) { const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1)); const adm = funcs.filter((f) => f.dataAdmissao >= ini && f.dataAdmissao < fim).length; const dem = funcs.filter((f) => f.dataDemissao && f.dataDemissao >= ini && f.dataDemissao < fim).length; const hc = headcount(m); s[m] = hc > 0 ? Math.round(((adm + dem) / 2 / hc) * 1000) / 10 : null; }
    series.turnover = s; }
  { const af = await prisma.afastamento.findMany({ where: { dataInicio: { gte: yIni, lt: yFim } }, select: { dataInicio: true, diasAfastado: true } });
    const s = arr12();
    for (let m = 0; m <= mesFim; m++) { const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1)); const dias = af.filter((x) => x.dataInicio >= ini && x.dataInicio < fim).reduce((a, x) => a + (x.diasAfastado || 0), 0); const hc = headcount(m); const prev = hc * uteisNoMes(ano, m); s[m] = prev > 0 ? Math.round((dias / prev) * 1000) / 10 : null; }
    series.absenteismo = s; }
  { const ac = await prisma.acidenteTrabalho.findMany({ where: { data: { gte: yIni, lt: yFim }, tipo: "COM_AFASTAMENTO" }, select: { data: true } });
    const s = arr12(); for (let m = 0; m <= mesFim; m++) s[m] = 0; for (const a of ac) { const m = a.data.getUTCMonth(); if (m <= mesFim) s[m] += 1; }
    series.acidentes_afastamento = s; }

  // ── Qualidade (RNC): RNCs do cliente + recorrência de NC + erros de projeto ──
  const rncs = await prisma.naoConformidade.findMany({ where: { data: { gte: yIni, lt: yFim } }, select: { data: true, tipo: true, origem: true, pertinente: true, recorrente: true, processoArea: true } });
  { const s = arr12(); for (let m = 0; m <= mesFim; m++) s[m] = 0; // RNCs do cliente (contagem de pertinentes no mês)
    for (const r of rncs) { if ((r.origem === "CLIENTE" || r.tipo === "CLIENTE") && r.pertinente) { const m = r.data.getUTCMonth(); if (m <= mesFim) s[m] += 1; } }
    series.rnc_cliente = s; }
  { const rec = arr12(), tot = arr12(); // recorrência (recorrentes ÷ total)
    for (const r of rncs) { const m = r.data.getUTCMonth(); tot[m] = (tot[m] || 0) + 1; if (r.recorrente) rec[m] = (rec[m] || 0) + 1; }
    series.recorrencia_nc = rec.map((v, m) => pct(v || 0, tot[m] || 0)); }
  { const s = arr12(); for (let m = 0; m <= mesFim; m++) s[m] = 0; const engRe = /ENGENH|PROJET/i; // erros de projeto (contagem de RNCs de engenharia/projeto)
    for (const r of rncs) { if (engRe.test(r.processoArea || "")) { const m = r.data.getUTCMonth(); if (m <= mesFim) s[m] += 1; } }
    series.erros_projeto = s; }

  // ── RH: atendimento das competências (snapshot, não mensal) ──
  let atendimentoComp = null;
  { const fs = await prisma.funcionario.findMany({ where: { ativo: true }, select: { competencias: { select: { competenciaId: true, nivelAtual: true } }, cargo: { select: { competencias: { select: { competenciaId: true, nivelEsperado: true } } } } } });
    let avaliados = 0, atendidos = 0;
    for (const f of fs) { const req = f.cargo?.competencias || []; if (!req.length) continue; const at = new Map(f.competencias.map((c) => [c.competenciaId, c.nivelAtual])); const comAval = req.filter((r) => at.has(r.competenciaId)); if (!comAval.length) continue; avaliados++; if (comAval.every((r) => (at.get(r.competenciaId) || 0) >= r.nivelEsperado)) atendidos++; }
    atendimentoComp = avaliados > 0 ? Math.round((atendidos / avaliados) * 1000) / 10 : null;
    series.atendimento_competencias = arr12().map((_, m) => (m === mes ? atendimentoComp : null)); }

  // Monta a resposta: cada indicador da config + série + valor do mês selecionado.
  const indicadores = INDICADORES_ISO.map((ind) => {
    const serie = series[ind.id] || arr12();
    const atual = serie[mes] ?? null;
    return { ...ind, serie, atual };
  });

  return NextResponse.json({ ano, mes, mesFim, indicadores });
}
