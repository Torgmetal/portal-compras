// Cálculo dos indicadores ISO de PRODUÇÃO (série mensal + acumulado do ano). Usado pela
// API do painel e pelo PDF. Os 2 da planilha: cumprimento dos prazos de fabricação e
// retrabalho. Os meses já fechados vêm do histórico apurado na planilha da Qualidade
// (HISTORICO_PRODUCAO); os meses seguintes vêm do cálculo automático do portal.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { whereSetorSyneco } from "@/lib/syneco-dia";
import { pesoRealPecas } from "@/lib/peso-op";

const arr12 = () => Array.from({ length: 12 }, () => null);
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const media = (serie) => {
  const v = serie.filter((x) => x != null);
  return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
};

// A partir de quando o "cumprimento de prazos" é medido pelo portal (expedido ÷ planejado).
// Os romaneios (peso expedido) só passaram a ser registrados em ago/2026 — antes disso o
// cálculo fica em branco e valem os valores apurados na planilha (HISTORICO_PRODUCAO).
const PRAZO_EXPEDIDO_DESDE = Date.UTC(2026, 7, 1); // agosto/2026

// Valores apurados manualmente na planilha da Qualidade (2026), fechados até o momento em
// que o portal passou a medir sozinho. Índice 0=jan. Onde é null, vale o cálculo do portal:
// retrabalho = peso das RNCs ÷ peso cortado; prazos = expedido ÷ planejado. Assim, de agosto
// em diante a série é do portal (retrabalho jan–jul e prazos jan–abr foram apurados à mão).
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

/** @returns { indicadores: [{...def, serie:[12], acumulado}] } */
export async function indicadoresProducaoIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const series = {};

  // Cumprimento dos Prazos de Fabricação — por PESO: expedido no mês ÷ peso planejado.
  // Planejado = peso real das OPs com dataFimPrevista no mês (pesoRealPecas, a partir da
  // LE/LPC). Realizado = peso dos romaneios emitidos no mês. Só a partir de PRAZO_EXPEDIDO_DESDE
  // (quando os romaneios começaram); antes disso fica em branco (jan–abr vêm do histórico).
  { const desde = new Date(Math.max(yIni.getTime(), PRAZO_EXPEDIDO_DESDE));
    const ops = desde < yFim
      ? await prisma.oP.findMany({ where: { dataFimPrevista: { gte: desde, lt: yFim } }, select: { dataFimPrevista: true, pecasConjunto: { select: { fonte: true, tipoPeca: true, pesoTotalKg: true } } } })
      : [];
    const plan = arr12();
    for (const o of ops) { const m = o.dataFimPrevista.getUTCMonth(); plan[m] = (plan[m] || 0) + pesoRealPecas(o.pecasConjunto); }
    const roms = desde < yFim
      ? await prisma.romaneioPrevio.findMany({ where: { emitidoEm: { gte: desde, lt: yFim } }, select: { emitidoEm: true, pesoKg: true } })
      : [];
    const exp = arr12();
    for (const r of roms) { const m = r.emitidoEm.getUTCMonth(); exp[m] = (exp[m] || 0) + (r.pesoKg || 0); }
    // Só mede os meses a partir do início do registro de expedido; os demais ficam null.
    series.prazo_fabricacao = plan.map((p, m) => (Date.UTC(ano, m, 1) < PRAZO_EXPEDIDO_DESDE ? null : pct(exp[m] || 0, p || 0))); }

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

  // Não mede meses futuros (senão OP prevista sem expedido daria 0% e poluiria o acumulado).
  const hoje = new Date();
  const mesAtual = ano < hoje.getUTCFullYear() ? 11 : ano > hoje.getUTCFullYear() ? -1 : hoje.getUTCMonth();

  // Sobrepõe o histórico apurado (planilha) nos meses fechados; acumulado = média dos meses.
  const hist = HISTORICO_PRODUCAO[ano] || {};
  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "PRODUCAO").map((ind) => {
    const auto = series[ind.id] || arr12();
    const h = hist[ind.id];
    const serie = auto.map((v, m) => (h && h[m] != null ? h[m] : m > mesAtual ? null : v));
    return { ...ind, serie, acumulado: media(serie) };
  });
  return { indicadores };
}
