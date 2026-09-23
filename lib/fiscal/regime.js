// ─── O REGIME DA TORG, DECLARADO — E CONFERIDO CONTRA AS NOTAS ───────────────
//
// ⚠⚠ ISTO É UM FATO DECLARADO, NÃO UMA INFERÊNCIA. Matheus (22/09/2026): *"base PIS/COFINS da TORG
// é LUCRO REAL, então é 1,65 e 7,6"*. A diferença importa: o portal não "descobriu" o regime
// olhando notas — alguém que responde por isso afirmou, e as notas serviram de CONFERÊNCIA. Um
// regime deduzido de histórico herdaria o erro do histórico, que é exatamente o que a NF-e 973
// prova ser possível (22 itens com o CST de IPI errado).
//
// ⚠⚠ E É POR ISSO QUE O ESCOPO DO MÓDULO NÃO É VIOLADO. A proibição do briefing é *"não aplicar PIS
// 1,65% e COFINS 7,6% a TODAS as operações"* — contra a SUPOSIÇÃO, não contra o regime declarado. A
// alíquota básica do regime continua sendo a REGRA GERAL: exportação, suspensão, alíquota zero e
// monofásico são exceções que o portal NÃO detecta, e a tela diz isso em cada simulação.
//
// ⚠ Quando o regime mudar, muda AQUI — com quem declarou e quando. Espalhado pelo código, a
// mudança seria uma caçada.

export const REGIME = {
  nome: "Lucro Real",
  // CRT 3 = Regime Normal. É o que sai no XML de toda NF-e da TORG.
  crt: "3",
  declaradoPor: "Matheus (Torg Metal)",
  declaradoEm: "2026-09-22",
  /**
   * ⚠ A CONFERÊNCIA, com número e nota — para quem ler daqui a um ano saber que não foi chute.
   * Medido em 22/09/2026 nos XMLs das NF-e 959, 973 e 979: CRT 3 no emitente, PIS e COFINS com
   * CST 01 em 100% dos itens, e o total batendo ao centavo contra o valor dos produtos.
   */
  conferidoEm: [
    { nf: "973", itens: 24, base: 222769.58, pis: 3675.70, cofins: 16930.50 },
    { nf: "979", itens: 1, base: 87482.91, pis: 1443.47, cofins: 6648.70 },
    { nf: "959", itens: 1, base: 145573.00, pis: 2401.95, cofins: 11063.55 },
  ],
};

/**
 * PIS E COFINS DA REGRA GERAL DO REGIME.
 *
 * ⚠⚠ CST 01 É "OPERAÇÃO TRIBUTÁVEL COM ALÍQUOTA BÁSICA" — é a regra geral do não-cumulativo, e é o
 * que as três notas conferidas trazem em todos os itens. Não é "o que costuma dar certo": é o
 * tratamento padrão do regime, do qual as outras situações são exceção nomeada.
 */
export const PIS_COFINS = [
  { tributo: "PIS", cst: "01", rotulo: "Operação tributável com alíquota básica", aliquota: 1.65 },
  { tributo: "COFINS", cst: "01", rotulo: "Operação tributável com alíquota básica", aliquota: 7.60 },
];

/**
 * ⚠⚠ AS EXCEÇÕES QUE O PORTAL NÃO DETECTA, ditas por nome. Um número sem esta lista vira carimbo;
 * com ela, vira ponto de partida que a pessoa sabe quando questionar.
 */
export const RESSALVAS_PIS_COFINS = [
  "Exportação e equiparadas não são tributadas (CST 08) — o portal não sabe se a operação é de exportação.",
  "Remessa e retorno de industrialização costumam ter tratamento próprio; a nota que apenas movimenta não é receita.",
  "Produto monofásico, com alíquota zero ou suspensão tem CST próprio e fundamento próprio.",
];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * A estimativa sobre o valor digitado.
 *
 * ⚠ A base observada nas notas é o VALOR DOS PRODUTOS. Numa operação real ela pode incluir frete e
 * outras despesas acessórias, e a tela diz de onde saiu o número em vez de deixar supor.
 */
export function estimarPisCofins(valor) {
  const base = r2(valor);
  if (!(base > 0)) return null;
  return {
    regime: REGIME.nome,
    base,
    baseNota: "Base: o valor dos produtos, que é o que as notas conferidas usam. Frete e despesas acessórias podem compor a base na operação real.",
    linhas: PIS_COFINS.map((t) => ({ ...t, valor: r2(base * t.aliquota / 100) })),
    ressalvas: RESSALVAS_PIS_COFINS,
  };
}
