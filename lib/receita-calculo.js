// ─── A CONTA DA RECEITA DA OP (modal "Adicionar receita") ─────────────────────
// ⚠⚠ O MODAL LIA O CAMPO COM `Number()`, E O CAMPO ENTREGA TEXTO EM PORTUGUÊS. Matheus
// (06/10/2026): "Valor da receita deve ser maior que zero" com R$ 519.539,62 digitados, e o resumo
// dizendo Bruto R$ 0,00 e Impostos 15%. Desde 16/09/2026 os campos são o `CampoDecimal`, que manda
// "519539,62" — e `Number("519539,62")` é NaN, que o `|| 0` transformava em zero.
//
// ⚠ O ESTRAGO SILENCIOSO ERA NAS ALÍQUOTAS. ICMS 12 e IRRF 3 passavam (sem vírgula); IPI 3,25,
// PIS 1,65, COFINS 7,6 e CSLL 1,08 sumiam da conta (daí os 15%) e iam no corpo como NaN, que o
// `JSON.stringify` grava como `null`. A receita podia ser salva — com o valor sem vírgula — e
// perder metade dos impostos sem aviso nenhum.
import { numeroBR } from "@/lib/numero-br";

export const ALIQUOTAS_RECEITA = ["icmsPct", "ipiPct", "pisPct", "cofinsPct", "issPct", "irrfPct", "csllPct"];

/**
 * Valor, impostos e líquido da receita, a partir do que está no formulário (texto ou número).
 * @param {Record<string, string|number|null|undefined>} form
 */
export function calcularReceita(form) {
  const porUnidade = form.tipoPreco === "POR_UNIDADE";
  const qtdNum = numeroBR(form.quantidade);
  const unitNum = numeroBR(form.valorUnitario);
  const valorNum = porUnidade ? qtdNum * unitNum : numeroBR(form.valor);
  const aliqTotal = ALIQUOTAS_RECEITA.reduce((s, k) => s + numeroBR(form[k]), 0);
  const impostosVal = valorNum * (aliqTotal / 100);
  return { porUnidade, qtdNum, unitNum, valorNum, aliqTotal, impostosVal, liquido: valorNum - impostosVal };
}

/** As alíquotas como a API grava: número, ou `null` para o campo vazio. Nunca NaN. */
export function aliquotasParaGravar(form) {
  return Object.fromEntries(ALIQUOTAS_RECEITA.map((k) => {
    const v = form[k];
    return [k, v === "" || v == null ? null : numeroBR(v, null)];
  }));
}
