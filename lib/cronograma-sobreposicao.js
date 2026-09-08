// SOBREPOSIÇÃO ENTRE ETAPAS DA FABRICAÇÃO — quanto do setor anterior precisa estar pronto para o
// seguinte começar. Fonte única: usada por quem CRIA cronograma novo e por quem conserta os que
// já existem, para as duas pontas não divergirem.
//
// ⚠⚠ POR QUE EXISTE. Vitor (07/09/2026): "um cronograma não pode ser em fila, quando a montagem já
// tiver uma quantidade de peças prontas a solda já tem que começar, tanto que isso sempre foi um
// erro no nosso cronograma, pois esperamos um setor estar 100% para depois começarmos no outro, o
// que não é real". No dia seguinte, sobre torná-lo padrão: "concordo com vc, precisamos implantar".
//
// Finish-to-start puro é ficção de planejamento: nenhuma fábrica de estrutura espera o corte acabar
// para montar. O portal já tinha o campo certo — `defasagemDias` (lead/lag, negativo = antecipação),
// que o recálculo respeita — e ninguém preenchia, então todo cronograma nascia em fila.
//
// ⚠ OS NÚMEROS SÃO MEDIDOS, NÃO ARBITRADOS. Saem dos apontamentos do Syneco
// (scripts/medir-sobreposicao-setores.mjs): para cada obra, quanto do setor anterior estava pronto
// no dia em que o seguinte começou. Só entram obras com o setor anterior JÁ ENCERRADO (último
// apontamento há mais de 30 dias) — em obra andando o denominador ainda cresce e o percentual sai
// inflado. Medido em 07/09/2026:
//
//     Preparação → Montagem   13 obras   mediana 76%   (faixa 12–100%)
//     Montagem   → Solda      13 obras   mediana 46%   (faixa  7–100%)
//     Solda      → Pintura    10 obras   mediana 46%   (faixa 10–100%)
//
// A faixa é larga de propósito no registro: os casos de 100% são as obras em que se esperou o setor
// fechar — o erro que se está corrigindo. A MEDIANA é o comportamento de quando a fábrica trabalha
// sobreposta. Refazer a medição quando houver mais obra encerrada.
//
// ⚠ Montagem em 76% e não 46% não é inconsistência: montagem precisa do conjunto INTEIRO cortado,
// então depende de quase todo o corte; solda e pintura pegam peça a peça.
//
// 🚫 A PREPARAÇÃO NÃO GANHA SOBREPOSIÇÃO. Ela espera material chegar, e material não chega pela
// metade útil: sem a barra não se corta. O que vem antes dela é Suprimentos, não um setor da
// fábrica. 🚫 EXPEDIÇÃO idem — embarque parcial é decisão de carga, não de sequência de setor.

/** Fração do setor ANTERIOR que precisa estar pronta para esta etapa começar. */
export const SOBREPOSICAO = { "Montagem": 0.76, "Solda": 0.46, "Pintura": 0.46 };

/** A etapa anterior de cada uma, na cadeia da fábrica. */
export const ETAPA_ANTERIOR = { "Montagem": "Preparação", "Solda": "Montagem", "Pintura": "Solda" };

/**
 * Defasagem (lead/lag, em dias úteis) que põe a etapa começando no ponto medido da anterior.
 *
 * O motor calcula início = próximo dia útil depois do fim da antecessora, + lag. Como
 * fim = início + D, o próximo dia útil é início + D + 1; para cair em início + X·D o lag é
 * X·D − D − 1. Negativo, portanto: é antecipação.
 *
 * @param {string} etapa nome da etapa (Montagem, Solda, Pintura)
 * @param {number} duracaoAnterior duração em dias da etapa anterior — JÁ com o encaixe de prazo
 *                 aplicado, senão o lag não corresponde à barra que vai para a tela
 * @returns {number} 0 quando a etapa não tem sobreposição definida ou a anterior não tem duração
 */
export function lagDaEtapa(etapa, duracaoAnterior) {
  const x = SOBREPOSICAO[etapa];
  const d = Number(duracaoAnterior) || 0;
  if (!x || d <= 0) return 0;
  return Math.round(x * d) - d - 1;
}
