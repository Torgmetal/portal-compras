// Cálculo dos indicadores ISO de RH e Segurança do Trabalho (série mensal + acumulado do
// ano), do dado real do portal. Usado pela API do painel e pelo PDF. Os 4 da planilha:
// turnover, absenteísmo, atendimento das competências e acidentes com afastamento.
// A lógica é a mesma que a rota /api/qualidade/indicadores já usava p/ os indicadores RH.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";

const arr12 = () => Array.from({ length: 12 }, () => null);
const r1 = (x) => Math.round(x * 10) / 10;
const media = (serie) => { const v = serie.filter((x) => x != null); return v.length ? r1(v.reduce((s, x) => s + x, 0) / v.length) : null; };
const soma = (serie) => { const v = serie.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
// Dias úteis (seg–sex) do mês.
const uteisNoMes = (ano, m) => { let c = 0; const dim = new Date(Date.UTC(ano, m + 1, 0)).getUTCDate(); for (let d = 1; d <= dim; d++) { const w = new Date(Date.UTC(ano, m, d)).getUTCDay(); if (w !== 0 && w !== 6) c++; } return c; };

/** @returns { indicadores: [{...def, serie:[12], acumulado}] } */
export async function indicadoresRhIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const hoje = new Date();
  const mesAtual = ano < hoje.getUTCFullYear() ? 11 : ano > hoje.getUTCFullYear() ? -1 : hoje.getUTCMonth();
  const series = {}, acumulados = {};

  const funcs = await prisma.funcionario.findMany({ select: { dataAdmissao: true, dataDemissao: true } });
  const headcount = (m) => { const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1)); return funcs.filter((f) => f.dataAdmissao < fim && (!f.dataDemissao || f.dataDemissao >= ini)).length; };

  // Turnover — ((admissões + desligamentos) ÷ 2 ÷ headcount do mês) × 100. Acum = média dos meses.
  { const s = arr12();
    for (let m = 0; m <= mesAtual; m++) {
      const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1));
      const adm = funcs.filter((f) => f.dataAdmissao >= ini && f.dataAdmissao < fim).length;
      const dem = funcs.filter((f) => f.dataDemissao && f.dataDemissao >= ini && f.dataDemissao < fim).length;
      const hc = headcount(m); s[m] = hc > 0 ? r1(((adm + dem) / 2 / hc) * 100) : null;
    }
    series.turnover = s; acumulados.turnover = media(s); }

  // Absenteísmo — dias de afastamento no mês ÷ (headcount × dias úteis do mês) × 100.
  { const af = await prisma.afastamento.findMany({ where: { dataInicio: { gte: yIni, lt: yFim } }, select: { dataInicio: true, diasAfastado: true } });
    const s = arr12();
    for (let m = 0; m <= mesAtual; m++) {
      const ini = new Date(Date.UTC(ano, m, 1)), fim = new Date(Date.UTC(ano, m + 1, 1));
      const dias = af.filter((x) => x.dataInicio >= ini && x.dataInicio < fim).reduce((a, x) => a + (x.diasAfastado || 0), 0);
      const prev = headcount(m) * uteisNoMes(ano, m); s[m] = prev > 0 ? r1((dias / prev) * 100) : null;
    }
    series.absenteismo = s; acumulados.absenteismo = media(s); }

  // Acidentes com afastamento — contagem por mês (meta 0). Acum = total do ano.
  { const ac = await prisma.acidenteTrabalho.findMany({ where: { data: { gte: yIni, lt: yFim }, tipo: "COM_AFASTAMENTO" }, select: { data: true } });
    const s = arr12(); for (let m = 0; m <= mesAtual; m++) s[m] = 0;
    for (const a of ac) { const m = a.data.getUTCMonth(); if (m <= mesAtual) s[m] += 1; }
    series.acidentes_afastamento = s; acumulados.acidentes_afastamento = soma(s); }

  // Atendimento das competências — snapshot (colaboradores com as competências da função
  // atendidas ÷ avaliados), colocado no mês atual. Enche conforme o RH lança as avaliações.
  { const fs = await prisma.funcionario.findMany({ where: { ativo: true }, select: { competencias: { select: { competenciaId: true, nivelAtual: true } }, cargo: { select: { competencias: { select: { competenciaId: true, nivelEsperado: true } } } } } });
    let avaliados = 0, atendidos = 0;
    for (const f of fs) { const req = f.cargo?.competencias || []; if (!req.length) continue; const at = new Map(f.competencias.map((c) => [c.competenciaId, c.nivelAtual])); const comAval = req.filter((rq) => at.has(rq.competenciaId)); if (!comAval.length) continue; avaliados++; if (comAval.every((rq) => (at.get(rq.competenciaId) || 0) >= rq.nivelEsperado)) atendidos++; }
    const val = avaliados > 0 ? r1((atendidos / avaliados) * 100) : null;
    series.atendimento_competencias = arr12().map((_, m) => (m === mesAtual ? val : null));
    acumulados.atendimento_competencias = val; }

  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "RH").map((ind) => ({
    ...ind, serie: series[ind.id] || arr12(), acumulado: acumulados[ind.id] ?? null,
  }));
  return { indicadores };
}
