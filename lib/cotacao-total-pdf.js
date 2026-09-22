// ─── O TOTAL DA LINHA DO PDF E O TOTAL DA LINHA DA TELA NÃO FALAM A MESMA LÍNGUA ─────────────
//
// ⚠⚠ MEDIDO NA TELA EM 21/09/2026, com os dois PDFs reais da SOUFER. Assim que o casamento
// PDF × RM passou a funcionar, as 7 linhas casadas da RM T122-002 saíram TODAS com o aviso
// vermelho "⚠ PDF: R$ …" — e as 7 estavam certas. O rodapé da própria tela entregava a conta:
// subtotal (preço × qtd) R$ 152.197,90 contra "total com IPI" R$ 157.144,33, exatamente 3,25%,
// que é o IPI de todas as linhas daquele documento.
//
// A comparação sempre foi essa; ela só era invisível porque, antes, nada casava e nada era
// comparado. E alarme que acende em 7 de 7 linhas CERTAS é o alarme que ensina o fornecedor a
// ignorar o alarme — inclusive na vez em que ele estiver certo.
//
// ⚠⚠ O NÚMERO MOSTRADO CONTINUA SENDO O IMPRESSO NO PDF. A correção é na COMPARAÇÃO, não no
// número: o aviso existe para o fornecedor bater o que está na tela contra a folha que ele mesmo
// mandou. Converter o total para líquido antes de exibir faria a tela mostrar um valor que não
// está em documento nenhum.

/** Em que base está o total que o parser leu na linha. */
export const BASE_TOTAL = {
  /** preço × quantidade, sem imposto — é o que a rota da IA pede no prompt. */
  LIQUIDO: "liquido",
  /** o total já com o IPI embutido — é a última coluna do layout SOUFER (17/17 linhas medidas). */
  COM_IPI: "com-ipi",
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** A mesma tolerância de sempre: 1% do valor, com piso de 50 centavos. */
export const toleranciaDe = (valor) => Math.max(Math.abs(num(valor)) * 0.01, 0.5);

/**
 * As duas leituras possíveis da mesma linha.
 * @returns {{liquido:number, comIpi:number}}
 */
export function basesDaLinha({ precoUnit, qtd, ipiPct }) {
  const liquido = num(precoUnit) * num(qtd);
  return { liquido, comIpi: liquido * (1 + num(ipiPct) / 100) };
}

/**
 * O TOTAL DO PDF DESMENTE O PREÇO × QUANTIDADE DESTA LINHA?
 *
 * ⚠⚠ QUANDO A BASE É CONHECIDA, A CHECAGEM CONTINUA ESTRITA. O parser sabe o layout que leu, e é
 * ele quem declara a base (`baseTotal`). Afrouxar a tolerância para 4% "para o IPI caber" mataria
 * a checagem inteira — ela existe para pegar preço lido como total, que erra por ordens de
 * grandeza, mas também erro de vírgula, que erra por 10%.
 *
 * ⚠⚠ QUANDO A BASE É DESCONHECIDA, ACEITA AS DUAS. É o caso de layout cujo contrato eu não medi
 * num documento real (GERDAU, hoje). Acender vermelho ali seria repetir o defeito com outro
 * fornecedor; calar a checagem seria perdê-la. Aceitar líquido OU com IPI custa um ponto cego do
 * tamanho exato do IPI, e mantém de pé tudo que erra mais que isso.
 *
 * @param {{pdfTotal:number, precoUnit:number|string, qtd:number|string, ipiPct:number|string|null, baseTotal?:string|null}} p
 * @returns {boolean}
 */
export function divergeDoPdf({ pdfTotal, precoUnit, qtd, ipiPct, baseTotal }) {
  const pdf = num(pdfTotal);
  const { liquido, comIpi } = basesDaLinha({ precoUnit, qtd, ipiPct });
  // ⚠ Sem os dois lados não há o que comparar — e "não sei" nunca pode virar "está errado".
  if (!(pdf > 0) || !(liquido > 0)) return false;

  const tol = toleranciaDe(pdf);
  const bate = (esperado) => Math.abs(pdf - esperado) <= tol;

  if (baseTotal === BASE_TOTAL.LIQUIDO) return !bate(liquido);
  if (baseTotal === BASE_TOTAL.COM_IPI) return !bate(comIpi);
  return !bate(liquido) && !bate(comIpi);
}

/**
 * ESTE TOTAL É O DA LINHA COM IMPOSTO, E NÃO UM PREÇO MAL LIDO?
 *
 * ⚠⚠ ISTO IMPEDE UMA REESCRITA DE PREÇO, E É O RISCO MAIS CARO DOS DOIS (achado do Codex,
 * 21/09/2026). A rota da IA, ao ver `preço × qtd` divergindo do total declarado, conclui que o
 * "preço" extraído era na verdade o total da linha e REESCREVE o unitário para `total ÷ qtd`. Num
 * PDF cujo total vem com IPI, isso sobe o preço do fornecedor em 3,25% sozinho — o portal
 * inventando dinheiro na proposta de outra empresa.
 *
 * ⚠ A assinatura é estreita de propósito: IPI declarado e positivo, o total batendo com a leitura
 * COM imposto e NÃO batendo com a líquida. Fora dessa janela, nada muda.
 *
 * ⚠ Ela recusa a correção — não "prova" a base tributária, nem converte o total. Ambiguidade
 * vira aviso, nunca reescrita (é a regra que o Codex pediu, e a mesma de `mesmaPeca`: "não sei"
 * não vira "sim").
 */
export function ehTotalComImposto({ totalDeclarado, precoUnit, qtd, ipiPct }) {
  const ipi = num(ipiPct);
  if (!(ipi > 0)) return false;
  const total = num(totalDeclarado);
  const { liquido, comIpi } = basesDaLinha({ precoUnit, qtd, ipiPct });
  if (!(total > 0) || !(liquido > 0)) return false;
  const tol = toleranciaDe(total);
  return Math.abs(total - comIpi) <= tol && Math.abs(total - liquido) > tol;
}
