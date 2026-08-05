// Cálculo dos indicadores ISO de COMPRAS (série mensal + acumulado do ano), a partir
// do dado real do portal. Usado pela API do painel e pelo PDF de acompanhamento.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { calcularIQF } from "@/lib/iqf-fornecedores";

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
const arr12 = () => Array.from({ length: 12 }, () => null);

/** @returns { indicadores: [{...def, serie:[12], acumulado}] } */
export async function indicadoresComprasIso(prisma, ano) {
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const series = {}, acumulados = {};

  // Retorno de Orçamento — média de dias úteis (solicitação → resposta do fornecedor).
  { const cot = await prisma.cotacao.findMany({ where: { recebidaEm: { gte: yIni, lt: yFim } }, select: { createdAt: true, recebidaEm: true } });
    const soma = arr12(), n = arr12();
    let somaAno = 0, nAno = 0;
    for (const c of cot) { const d = diasUteis(c.createdAt, c.recebidaEm); const m = c.recebidaEm.getUTCMonth(); soma[m] = (soma[m] || 0) + d; n[m] = (n[m] || 0) + 1; somaAno += d; nAno += 1; }
    series.retorno_orcamento = soma.map((v, m) => (n[m] ? Math.round((v / n[m]) * 10) / 10 : null));
    acumulados.retorno_orcamento = nAno ? Math.round((somaAno / nAno) * 10) / 10 : null; }

  // Compras nível "B" — % do valor comprado com fornecedor IQF ≥ 75% (avaliação automática).
  try { const { serieComprasNivelB, acumuladoNivelB } = await calcularIQF(prisma, { yIni, yFim }); series.compras_fornecedor_b = serieComprasNivelB; acumulados.compras_fornecedor_b = acumuladoNivelB; }
  catch { /* IQF falhou — indicador fica sem série, não derruba os outros */ }

  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "COMPRAS").map((ind) => ({
    ...ind, serie: series[ind.id] || arr12(), acumulado: acumulados[ind.id] ?? null,
  }));
  return { indicadores };
}
