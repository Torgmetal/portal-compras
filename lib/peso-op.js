import { marcaEhAC } from "./marca-ac";
// Peso REAL de uma OP a partir das peças (PecaConjunto). Evita a dobra que o Vitor
// apontou (29/07):
//   - CROQUI é o detalhamento do CONJUNTO (mesmo peso) → NÃO soma junto;
//   - LE e LPC descrevem a MESMA estrutura, com marcas diferentes → NÃO soma as duas.
// Fonte canônica = a LE (marcas de expedição). Sem LE importada, usa o LPC
// (conjuntos + avulsas, sem croqui). As peças precisam ter { fonte, tipoPeca, pesoTotalKg }.
export function pesoRealPecas(pecas) {
  const total = pecasReais(pecas).reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0);
  return Math.round(total * 100) / 100;
}

// Peças que representam o MODELO Tekla de uma OP (módulo Engenharia), SEM dobra: os
// conjuntos + avulsas do LPC, tirando o CROQUI (detalhe do conjunto → dobraria) e a LE
// (marcas de expedição = a MESMA estrutura vista de outro jeito). Sem LPC importado, cai
// pra LE. Difere de pesoRealPecas (que prioriza a LE p/ o peso real de expedição): aqui a
// base é o modelo Tekla/LPC, coerente com o produzido (que o Syneco aponta nas peças LPC).
// Some o campo que quiser sobre o retorno (pesoTotalKg, pesoProduzido, qte, qteProduzida).
export function pecasTekla(pecas) {
  const arr = pecas || [];
  const lpc = arr.filter((p) => p.fonte !== "LE_IMPORT" && p.tipoPeca !== "CROQUI");
  // Usa o LPC só se ele TEM peso — algumas OPs têm linhas LPC placeholder (0 kg) e o peso
  // real está na LE (ex.: OP-071). Nesse caso cai pra LE, senão o modelado ficaria 0.
  const lpcPeso = lpc.reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0);
  return lpcPeso > 0 ? lpc : arr.filter((p) => p.fonte === "LE_IMPORT");
}

// ─── A LISTA QUE CONTA — peso E peças pela mesma régua ────────────────────────
// Vitor (15/09/2026), OP-103: "no data book mostra 854 peças" — eram LPC (442) + LE (412) somadas,
// a mesma estrutura duas vezes, e o peso dobrado do mesmo jeito (21 t numa obra de 10,5 t). O data
// book somava toda linha CONJUNTO/null da OP. A régua é a de `pesoRealPecas`: a LE é o documento
// (o que embarca); sem LE, a LPC sem croqui. Quem conta peças usa ESTA seleção, nunca a tabela crua.
// As peças precisam ter { fonte, naLE, tipoPeca, qte, pesoTotalKg }.
// ⚠ A LE é reconhecida pela flag `naLE` (pertencimento, desde 02/09/2026) ou pela `fonte` — quem
// seleciona só `fonte` continua funcionando como antes.
export function pecasReais(pecas) {
  const arr = pecas || [];
  const le = arr.filter((p) => p.naLE === true || p.fonte === "LE_IMPORT");
  if (le.some((p) => (Number(p.pesoTotalKg) || 0) > 0)) return le;
  return arr.filter((p) => p.fonte !== "LE_IMPORT" && p.tipoPeca !== "CROQUI");
}

/**
 * Quantas peças a OP tem, pela lista canônica (soma de `qte`).
 * ⚠ Parafuso não é peça: a LE traz o item AC com a quantidade de unidades (a OP-083 tem 30.405
 * parafusos e 2.714 peças) e o data book diria "33.119 peças". Fica de fora pela marca
 * ([[torg_listas_le_lpc]]); grade, degrau e telha embarcam e continuam contando.
 */
export function contagemRealPecas(pecas) {
  return pecasReais(pecas).filter((p) => !marcaEhAC(p.marca)).reduce((s, p) => s + (Number(p.qte) || 0), 0);
}
