// Cálculo dos indicadores ISO de PRODUÇÃO (série mensal + acumulado do ano). Usado pela
// API do painel e pelo PDF. Os 2 da planilha: cumprimento dos prazos de fabricação e
// retrabalho. Os meses já fechados vêm do histórico apurado na planilha da Qualidade
// (HISTORICO_PRODUCAO); os meses seguintes vêm do cálculo automático do portal.
import { INDICADORES_ISO } from "@/lib/indicadores-iso";
import { retrabalhoDoAno, serieDoProcesso } from "@/lib/retrabalho";
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
    // ⚠ MAI, JUN E JUL VIERAM DO VITOR (27/08/2026): "para o indicador da produção informe um valor
    // para os meses que está em branco, pode colocar em 94%, 95 e 96%". São valores INFORMADOS por
    // ele, não apurados pelo portal — o portal só mede prazos de ago/2026 em diante, quando os
    // romaneios passaram a registrar o expedido (PRAZO_EXPEDIDO_DESDE). Ficam aqui, no histórico,
    // pelo mesmo motivo dos outros: é a série que a Qualidade publica.
    prazo_fabricacao: [68, 92, 98, 71, 94, 95, 96, null, null, null, null, null],
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
      ? await prisma.oP.findMany({ where: { dataFimPrevista: { gte: desde, lt: yFim } }, select: { id: true, dataFimPrevista: true, pecasConjunto: { select: { fonte: true, tipoPeca: true, pesoTotalKg: true } } } })
      : [];
    // Peso planejado por OP = lista de engenharia (pesoRealPecas); sem lista, cai pro peso
    // CONTRATADO da Lista de Expedição (cobre OPs sem LE/LPC importada). Sem os dois, fica 0.
    const les = ops.length ? await prisma.listaExpedicao.findMany({ where: { opId: { in: ops.map((o) => o.id) } }, select: { opId: true, pesoContratado: true } }) : [];
    const contratado = new Map(les.map((l) => [l.opId, l.pesoContratado || 0]));
    const plan = arr12();
    for (const o of ops) { const m = o.dataFimPrevista.getUTCMonth(); plan[m] = (plan[m] || 0) + (pesoRealPecas(o.pecasConjunto) || contratado.get(o.id) || 0); }
    const roms = desde < yFim
      ? await prisma.romaneioPrevio.findMany({ where: { emitidoEm: { gte: desde, lt: yFim } }, select: { emitidoEm: true, pesoKg: true } })
      : [];
    const exp = arr12();
    for (const r of roms) { const m = r.emitidoEm.getUTCMonth(); exp[m] = (exp[m] || 0) + (r.pesoKg || 0); }
    // Só mede os meses a partir do início do registro de expedido; os demais ficam null.
    series.prazo_fabricacao = plan.map((p, m) => (Date.UTC(ano, m, 1) < PRAZO_EXPEDIDO_DESDE ? null : pct(exp[m] || 0, p || 0))); }

  // Retrabalho — Σ peso retrabalhado ÷ produção do mês (peso cortado). O cálculo mora em
  // lib/retrabalho, que lê os APONTAMENTOS (FORM 34) e as RNCs sem apontamento, e reparte por setor.
  //
  // ⚠⚠ O HISTÓRICO APURADO À MÃO CONTINUA VALENDO NOS MESES QUE ELE COBRE. O portal mede menos que a
  // planilha da Qualidade porque o PESO falta na origem: dos 95 apontamentos de 2026, NENHUM tinha
  // peso (50 foram deduzidos do cadastro pela marca). Trocar 3,05% por 0,4% em janeiro seria
  // publicar uma melhora que não houve. A partir do mês em que o peso passa a vir das peças
  // escolhidas na LE, o número do portal é o que vale.
  //
  // ⚠⚠ SÓ OS SETORES DA PRODUÇÃO. Vitor (27/08/2026): "no indicador do terceiro não deve trazer no
  // indicador da produção; apenas se for apontado que o erro foi da engenharia, aí sim você lista
  // no indicador da engenharia". Retrabalho causado por fornecedor/terceiro, pela Engenharia, pela
  // Expedição ou na movimentação consumiu horas da fábrica, mas não é desempenho da Produção —
  // cobrar dela um índice que ela não controla é o jeito mais rápido de o indicador virar piada
  // interna. O total da fábrica continua no detalhamento, com cada origem na sua linha.
  const retrab = await retrabalhoDoAno(prisma, ano);
  series.retrabalho = serieDoProcesso(retrab, "PRODUCAO").serie;

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
  return { indicadores, retrabalho: retrab };
}
