// Cálculo dos indicadores ISO de PRODUÇÃO (série mensal + acumulado do ano), do dado
// real do portal. Usado pela API do painel e pelo PDF. Os 2 da planilha: cumprimento
// dos prazos de fabricação e retrabalho.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";

const arr12 = () => Array.from({ length: 12 }, () => null);
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/** @returns { indicadores: [{...def, serie:[12], acumulado}] } */
export async function indicadoresProducaoIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const series = {}, acumulados = {};

  // Cumprimento dos Prazos de Fabricação — % de OPs concluídas no prazo (dataFimReal
  // ≤ dataFimPrevista), por mês da conclusão. Acumulado = % do ano.
  { const ops = await prisma.oP.findMany({ where: { dataFimReal: { gte: yIni, lt: yFim }, dataFimPrevista: { not: null } }, select: { dataFimReal: true, dataFimPrevista: true } });
    const ok = arr12(), t = arr12(); let okA = 0, tA = 0;
    for (const o of ops) { const m = o.dataFimReal.getUTCMonth(); t[m] = (t[m] || 0) + 1; tA += 1; if (o.dataFimReal <= o.dataFimPrevista) { ok[m] = (ok[m] || 0) + 1; okA += 1; } }
    series.prazo_fabricacao = ok.map((v, m) => pct(v || 0, t[m] || 0)); acumulados.prazo_fabricacao = pct(okA, tA); }

  // retrabalho — pendente (o Syneco entrega retrabalho zerado; precisa de captura real).

  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "PRODUCAO").map((ind) => ({
    ...ind, serie: series[ind.id] || arr12(), acumulado: acumulados[ind.id] ?? null,
  }));
  return { indicadores };
}
