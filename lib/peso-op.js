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
