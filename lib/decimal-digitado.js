// ─── O QUE O USUÁRIO DIGITA NUM CAMPO DECIMAL ────────────────────────────────
//
// ⚠⚠ `<input type="number">` NÃO ACEITA VÍRGULA — ELE A DESCARTA, E OS DÍGITOS SE COLAM.
// Medido no Chromium (15/09/2026, pt-BR E en-US, o mesmo nos dois):
//
//     digitado "31,020"   → input.value "31020"
//     digitado "31,02"    → input.value "3102"
//     digitado "0,000001" → input.value "0000001"
//
// Não é arredondamento nem locale: é a vírgula sumindo. Quem digitava R$ 31,02 num campo de preço
// lançava 3.102,00 — cem vezes mais —, e quem digitava 31,020 de quantidade lançava 31.020. Foi o
// que o Matheus viu na proposta manual da RM (15/09/2026): 31,020 × 10 dando R$ 310.200,00.
//
// ⚠ O `step="0.01"` que acompanhava esses campos nunca teve chance de ajudar: ele valida o número
// DEPOIS de a vírgula já ter sido descartada.
//
// A saída é campo de TEXTO com `inputMode="decimal"` (o teclado do celular continua numérico) e a
// conversão por `numeroBR`, que é a função que o portal inteiro usa para ler número em português.

/** Quantas casas decimais os campos de quantidade e preço aceitam. */
export const CASAS_PADRAO = 6;

/**
 * Limpa o que foi digitado, preservando o que a pessoa quis dizer.
 *
 * ⚠ NÃO FORMATA ENQUANTO SE DIGITA. Reescrever o texto a cada tecla move o cursor e faz a pessoa
 * perder a conta do que já escreveu — o valor só é interpretado (por `numeroBR`) no cálculo.
 *
 * ⚠ O corte de casas vale para a VÍRGULA, que é o separador decimal em português. Depois de um
 * ponto não se corta nada: "1.234.567" é milhar, e cortar ali mutilaria o número em vez de
 * limitá-lo. Quem escreve o decimal com ponto cai na regra de `numeroBR`, que já distingue os dois.
 *
 * @param {string} texto  o que veio do input
 * @param {number} casas  máximo de dígitos depois da vírgula
 */
export function limparDecimalDigitado(texto, casas = CASAS_PADRAO) {
  let s = String(texto ?? "");
  // sinal só na frente, e um só
  const negativo = s.trimStart().startsWith("-");
  s = s.replace(/[^\d.,]/g, "");

  // ⚠ DUAS VÍRGULAS: ou é engano de digitação, ou é milhar americano colado de um PDF. A diferença
  // é mensurável — no americano TODA vírgula separa exatamente três dígitos ("1,234,567"). Fora
  // desse desenho, a primeira vírgula é o decimal e as outras são tecla a mais: "1,2,3" é 1,23, não
  // 123. Deixar as duas passar entregaria o número a `numeroBR` como milhar en-US e multiplicaria
  // o valor por cem sem ninguém ver.
  if ((s.match(/,/g) || []).length > 1 && !/^\d{1,3}(,\d{3})+$/.test(s)) {
    const j = s.indexOf(",");
    s = s.slice(0, j + 1) + s.slice(j + 1).replace(/,/g, "");
  }

  const i = s.lastIndexOf(",");
  if (i >= 0 && casas >= 0) {
    const inteiro = s.slice(0, i + 1);
    const decimais = s.slice(i + 1).replace(/[.,]/g, "").slice(0, casas);
    s = inteiro + decimais;
  }
  return (negativo ? "-" : "") + s;
}
