// Peso REAL de uma OP a partir das peças (PecaConjunto). Evita a dobra que o Vitor
// apontou (29/07):
//   - CROQUI é o detalhamento do CONJUNTO (mesmo peso) → NÃO soma junto;
//   - LE e LPC descrevem a MESMA estrutura, com marcas diferentes → NÃO soma as duas.
// Fonte canônica = a LE (marcas de expedição). Sem LE importada, usa o LPC
// (conjuntos + avulsas, sem croqui). As peças precisam ter { fonte, tipoPeca, pesoTotalKg }.
export function pesoRealPecas(pecas) {
  const arr = pecas || [];
  const le = arr.filter((p) => p.fonte === "LE_IMPORT").reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0);
  if (le > 0) return Math.round(le * 100) / 100;
  const lpc = arr
    .filter((p) => p.fonte !== "LE_IMPORT" && p.tipoPeca !== "CROQUI")
    .reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0);
  return Math.round(lpc * 100) / 100;
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
