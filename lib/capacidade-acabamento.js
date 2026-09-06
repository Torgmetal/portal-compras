// ─── A META DO ACABAMENTO ──────────────────────────────
//
// ⚠⚠ 280 TONELADAS/MÊS — a meta de ENTREGA da fábrica. Vitor (06/09/2026): "vamos deixar como 280
// toneladas mês como meta (…) já o acabamento precisa voltar a ser 280 toneladas".
//
// ⚠⚠ POR QUE 280 AQUI E 230 NA MONTAGEM E NA SOLDA. Porque o funil REABRE neste setor. Um quarto do
// peso são marcas avulsas, que saem do corte direto para cá sem ver bancada — medido em 06/09/2026
// nas cinco OPs vivas: das 89.761 t que chegam ao acabamento, 22.139 (25%) nunca tiveram ordem de
// montagem. O fluxo real dessas obras:
//
//   Corte       93.882 kg   1.638 marcas
//   Preparação  83.377 kg   1.077
//   Montagem    67.622 kg     423   ← estreita: só conjunto
//   Solda       67.622 kg     423
//   Acabamento  89.761 kg     800   ← reabre: as avulsas reentram
//   Jato        93.867 kg     928
//   Pintura     93.867 kg     928
//
// ⚠ NÃO HÁ BANCADA. Vitor (06/09/2026): "não temos bancadas, vamos selecionar uma única OP e vamos
// executar os trabalhos de acabamento". A unidade aqui é a OP inteira, não o lote nem o conjunto —
// e por isso a meta é kg/dia direto, sem a régua de peças por faixa de peso que montagem e solda
// precisam.
//
// ⚠⚠ O TAMANHO DO DESAFIO, dito na cara: o ritmo MEDIDO do acabamento é 4.658 kg/dia (p75 de 90
// dias de apontamento do Syneco). A meta pede 13.333 — fator 2,9. É o maior salto pedido a qualquer
// setor, e o acabamento é hoje a fila mais longa da fábrica (18 dias contra 14,7 do jato e 4 da
// pintura). Vitor: "precisamos entregar 250 ton no mês sem choro nem vela" — e depois subiu para
// 280. Fica registrado que o número é decisão de direção, não projeção do medido.
//
// ⚠ A PINTURA NÃO É GARGALO, ao contrário do que a fila em quilos sugere: ela faz 23.389 kg/dia e
// já entrega quase o dobro da meta. Jato (6.397) e acabamento (4.658) é que travam a entrega.

/** Meta de entrega da fábrica, em kg por mês. */
export const META_KG_MES = 280000;

/** Dias úteis considerados no mês. 21 é a base usada em todas as metas do portal. */
export const DIAS_UTEIS_MES = 21;

/** Meta diária do acabamento, em kg. Não tem bancada: é o setor inteiro. */
export const META_KG_DIA_ACABAMENTO = Math.round(META_KG_MES / DIAS_UTEIS_MES);

/** Ritmo medido (p75 de 90 dias do Syneco) — o que o setor faz hoje, para comparar com a meta. */
export const RITMO_MEDIDO_KG_DIA = 4658;

/**
 * Quantos dias de acabamento um lote de `kg` ocupa.
 * @param {number} kg peso do que vai ser acabado
 * @param {number} [kgDia] régua a usar; padrão é a meta, passe RITMO_MEDIDO_KG_DIA para o realista
 */
export function diasDeAcabamento(kg, kgDia = META_KG_DIA_ACABAMENTO) {
  const k = Number(kg) || 0;
  const r = Number(kgDia) || META_KG_DIA_ACABAMENTO;
  return r > 0 ? k / r : 0;
}
