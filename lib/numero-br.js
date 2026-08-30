// ─── NÚMERO DIGITADO NO PADRÃO BRASILEIRO ─────────────────────────────────────
// Vitor (30/08/2026): "na tela do fornecedor alguns valores não estão casando, sempre tenho que
// revisar, isso quebra no Omie; não sei se é cálculo de imposto ou o que é".
//
// Não era imposto. Era `parseFloat(String(v).replace(",", "."))`, que estava em 107 lugares do
// portal e tem dois furos:
//
//   · `replace(",", ".")` troca só a PRIMEIRA vírgula. "4.963,43" vira "4.963.43", e o `parseFloat`
//     para no primeiro ponto → **4,963**. Mil vezes menor.
//   · ponto de milhar sozinho ("1.234") já era lido como 1,234 desde sempre.
//
// Medido em 30/08/2026 nas cotações com proposta anexada: 45 de 83 divergiam, quase todas com razão
// 0,001 — HARD PARAFUSOS com R$ 4,95 no lugar de R$ 4.963,43; AZEVEDO com R$ 31,74 no lugar de
// R$ 31.737,45. É por isso que o pedido quebrava no Omie.

/**
 * Converte texto digitado (pt-BR ou en-US) em número. Devolve `padrao` quando não dá para ler.
 *
 * @param {string|number|null|undefined} v
 * @param {number} [padrao=0]
 */
export function numeroBR(v, padrao = 0) {
  if (typeof v === "number") return Number.isFinite(v) ? v : padrao;
  const bruto = String(v ?? "").trim();
  if (!bruto) return padrao;

  // fora dígitos, separadores e sinal: "R$ 1.234,56/kg" tem de virar 1234.56
  const s = bruto.replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return padrao;

  const iVirgula = s.lastIndexOf(",");
  const iPonto = s.lastIndexOf(".");
  let normal;

  if (iVirgula >= 0 && iPonto >= 0) {
    // os dois presentes: o ÚLTIMO é o decimal, o outro é milhar
    normal = iVirgula > iPonto
      ? s.replace(/\./g, "").replace(",", ".")   // 1.234,56  (pt-BR)
      : s.replace(/,/g, "");                     // 1,234.56  (en-US)
  } else if (iVirgula >= 0) {
    // ⚠ vírgula sozinha é sempre decimal aqui — ninguém escreve milhar com vírgula e sem ponto num
    // formulário em português. E várias vírgulas ("1,234,567") só podem ser milhar en-US.
    normal = s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (iPonto >= 0) {
    // ⚠⚠ PONTO SOZINHO É AMBÍGUO: "4.963" é quatro mil em pt-BR e quatro vírgula nove em en-US.
    // A regra: se depois do último ponto vierem EXATAMENTE 3 dígitos, é milhar. Cobre o caso real
    // (fornecedor digitando "4.963") e preserva o preço unitário com centavos ("12.50") e com três
    // casas decimais escrito com vírgula ("0,125"), que é como ele aparece de verdade.
    const partes = s.split(".");
    const ultima = partes[partes.length - 1];
    normal = ultima.length === 3 && partes.length >= 2 ? s.replace(/\./g, "") : s;
  } else {
    normal = s;
  }

  const n = parseFloat(normal);
  return Number.isFinite(n) ? n : padrao;
}
