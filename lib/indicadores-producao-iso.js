// Cálculo dos indicadores ISO de PRODUÇÃO (série mensal + acumulado do ano). Usado pela
// API do painel e pelo PDF. Os 2 da planilha: cumprimento dos prazos de fabricação e
// retrabalho. Os meses já fechados vêm do histórico apurado na planilha da Qualidade
// (HISTORICO_PRODUCAO); os meses seguintes vêm do cálculo automático do portal.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { whereSetorSyneco } from "@/lib/syneco-dia";

const arr12 = () => Array.from({ length: 12 }, () => null);
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const media = (serie) => {
  const v = serie.filter((x) => x != null);
  return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
};

// Valores apurados manualmente na planilha da Qualidade (2026), fechados até o momento em
// que o portal passou a medir sozinho. Índice 0=jan. Onde é null, vale o cálculo do portal:
// retrabalho = peso das RNCs ÷ peso cortado; prazos = datas da OP. Assim, de agosto/2026 em
// diante a série é do portal (retrabalho jan–jul e prazos jan–abr foram apurados à mão).
export const HISTORICO_PRODUCAO = {
  2026: {
    prazo_fabricacao: [68, 92, 98, 71, null, null, null, null, null, null, null, null],
    retrabalho: [3.05, 1.44, 1.14, 5.54, 0.84, 1.17, 1.09, null, null, null, null, null],
  },
};

/** Valor apurado manualmente para (indicador, ano, mês) — ou null se o mês vem do portal. */
export function historicoProducao(id, ano, mes) {
  const v = HISTORICO_PRODUCAO[ano]?.[id];
  return v && v[mes] != null ? v[mes] : null;
}

// O cálculo pelo portal alimenta os meses fora do histórico? Retrabalho sim (RNCs ÷ corte).
// Prazos ainda NÃO: como as datas de conclusão da OP não são confiáveis, o portal sai 0%
// (previsões furadas) — publicar isso seria número errado. Até as datas ficarem confiáveis,
// prazos mostra só o histórico apurado. Vira true assim que a data real da OP for confiável.
const PORTAL_ATIVO = { prazo_fabricacao: false, retrabalho: true };

/** @returns { indicadores: [{...def, serie:[12], acumulado}] } */
export async function indicadoresProducaoIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const series = {};

  // Cumprimento dos Prazos de Fabricação — % de OPs concluídas no prazo (dataFimReal ≤
  // dataFimPrevista), por mês da conclusão.
  { const ops = await prisma.oP.findMany({ where: { dataFimReal: { gte: yIni, lt: yFim }, dataFimPrevista: { not: null } }, select: { dataFimReal: true, dataFimPrevista: true } });
    const ok = arr12(), t = arr12();
    for (const o of ops) { const m = o.dataFimReal.getUTCMonth(); t[m] = (t[m] || 0) + 1; if (o.dataFimReal <= o.dataFimPrevista) ok[m] = (ok[m] || 0) + 1; }
    series.prazo_fabricacao = ok.map((v, m) => pct(v || 0, t[m] || 0)); }

  // Retrabalho — Σ peso retrabalhado (RNCs com disposição RETRABALHAR, campo pesoRetrabalhoKg)
  // ÷ produção do mês. Produção = peso cortado (Preparação/CORTE no Syneco), pois todo item
  // passa uma vez pelo corte — somar todos os setores contaria a mesma peça 5×. Por mês da RNC.
  { const corte = await prisma.mesApontamento.findMany({
      where: { dataInicio: { gte: yIni, lt: yFim }, ...whereSetorSyneco("CORTE") },
      select: { dataInicio: true, produzidoKg: true },
    });
    const prod = arr12();
    for (const a of corte) { const m = a.dataInicio.getUTCMonth(); prod[m] = (prod[m] || 0) + (a.produzidoKg || 0); }
    const rncs = await prisma.naoConformidade.findMany({
      where: { disposicao: "RETRABALHAR", pesoRetrabalhoKg: { not: null }, data: { gte: yIni, lt: yFim } },
      select: { data: true, pesoRetrabalhoKg: true },
    });
    const rt = arr12();
    for (const r of rncs) { if (!r.data) continue; const m = r.data.getUTCMonth(); rt[m] = (rt[m] || 0) + (r.pesoRetrabalhoKg || 0); }
    series.retrabalho = prod.map((p, m) => pct(rt[m] || 0, p || 0)); }

  // Sobrepõe o histórico apurado (planilha) nos meses fechados; acumulado = média dos meses.
  const hist = HISTORICO_PRODUCAO[ano] || {};
  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "PRODUCAO").map((ind) => {
    const base = PORTAL_ATIVO[ind.id] === false ? arr12() : (series[ind.id] || arr12());
    const h = hist[ind.id];
    const serie = h ? base.map((v, m) => (h[m] != null ? h[m] : v)) : base;
    return { ...ind, serie, acumulado: media(serie) };
  });
  return { indicadores };
}
