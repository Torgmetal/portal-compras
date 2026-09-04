// ─── OS ITENS DO PEDIDO, NA BASE QUE O FORNECEDOR COTOU ────────────────────────
//
// Vitor (04/09/2026): "na geração do Omie o valor mudava do que estava no portal para o que foi
// gerado para o fornecedor (…) você precisa verificar uma forma de ficar confiável esses números".
//
// ⚠⚠ O ERRO ERA CONVERTER A QUANTIDADE E NÃO CONVERTER O PREÇO JUNTO. O gerador trocava a
// quantidade cotada pelo PESO da RM e mantinha o preço unitário do fornecedor. Duas consequências,
// medidas na base em 04/09/2026 (136 de 578 itens vencedores com quantidade divergente):
//   • quando o fornecedor cotou MAIS que a RM pede (lote mínimo — Vitor: "às vezes é maior pela
//     questão da quantidade mínima que ele fornece, isso deve continuar"), o pedido saía pela
//     quantidade MENOR: cotou 94 kg a R$ 7,80 e o pedido foi 76,95 kg a R$ 9,53.
//   • quando a linha veio na unidade do fornecedor (barra/peça) em vez de kg, o preço por barra
//     multiplicava pelo peso: 13,28 barras a R$ 7.390 viravam 13.276 kg a R$ 7.390.
//
// ⚠⚠ A REGRA AGORA É UMA SÓ: sai `qtdCotada × precoUnit`, que é exatamente o que o fornecedor viu,
// somou e assinou no portal. O total do pedido passa a ser igual ao total da proposta dele — que é
// a propriedade que faltava para o número ser confiável. Lote mínimo entra inteiro, sem ajuste.
//
// ⚠ O QUE NÃO SE FAZ MAIS: reescrever preço unitário para o total "bater" com o `totalProposta`.
// Medido na base: das 58 propostas em que o pedido cobre a proposta inteira, 64% já batiam na
// vírgula e 81% batiam em até 5% — e onde a diferença era grande NÃO era frete embutido, era
// digitação (JOTUN com um zero a mais: R$ 119.274 contra R$ 11.927; TECIAM com a vírgula errada:
// R$ 14,86 contra R$ 14.858). Corrigir preço em silêncio para acomodar um erro de digitação foi o
// que tornou o número não confiável. Agora a divergência é avisada, não maquiada.

/** faixa em que a diferença entre peso da RM e quantidade cotada ainda é lote mínimo/sobra */
const RAZAO_MIN = 1 / 3;
const RAZAO_MAX = 3;

/**
 * @param {{cotItem:object, rmItem:object, codigoOmieItem?:string}[]} linhas
 * @returns {{ itens: object[], alertas: {marca?:string, descricao:string, motivo:string}[] }}
 */
export function itensDoPedido(linhas) {
  const alertas = [];
  const itens = (linhas || []).map((l) => {
    const ipiPct = Number(l.cotItem.ipiPct) || 0;
    const precoBruto = Number(l.cotItem.precoUnit) || 0;
    const precoComIPI = precoBruto * (1 + ipiPct / 100);

    const pesoRm = Number(l.rmItem.peso) || 0;
    const qtdRm = Number(l.rmItem.qtd) || 0;
    const qtdCotada = Number(l.cotItem.qtdCotada) || 0;

    // ⚠ o fallback existe para o fornecedor que respondeu sem preencher a quantidade: aí vale o
    // líquido do abatimento de estoque (quando houve consulta) e, por último, o peso da RM.
    let qtd = qtdCotada;
    if (!(qtd > 0)) {
      if (l.cotItem.qtdPecasCotada != null) {
        qtd = pesoRm > 0 && qtdRm > 0
          ? Math.round((pesoRm * Number(l.cotItem.qtdPecasCotada) / qtdRm) * 100) / 100
          : Number(l.cotItem.qtdPecasCotada) || 0;
      } else {
        qtd = pesoRm > 0 ? pesoRm : 0;
      }
    }

    // ⚠ A UNIDADE É A QUE O FORNECEDOR VIU NO PORTAL, e ela é decidida do mesmo jeito lá
    // (CotacaoFornecedorForm: `usaKg = pesoRm > 0`). Rotular de outro jeito faria o Omie receber
    // quantidade numa base e nome noutra.
    const unidade = pesoRm > 0 ? "KG" : (l.rmItem.unidade || "KG");

    // ⚠⚠ O VERIFICADOR. Quantidade e peso na MESMA ordem de grandeza é lote mínimo e passa direto —
    // é o caso de 111 dos 136 itens divergentes da base. Fora da faixa, a quantidade quase sempre
    // está na unidade do fornecedor com o rótulo de kg (13,28 barras marcadas como 13,28 KG), e aí
    // quem decide é uma pessoa: o portal avisa em vez de adivinhar.
    if (pesoRm > 0 && qtdCotada > 0) {
      const r = pesoRm / qtdCotada;
      if (r > RAZAO_MAX || r < RAZAO_MIN) {
        alertas.push({
          marca: l.rmItem.codigo || null,
          descricao: l.rmItem.descricao || "",
          motivo: `cotado ${qtdCotada} contra ${pesoRm} kg na RM (${r.toFixed(1)}x) — confira se a quantidade `
            + `está em kg ou na unidade do fornecedor; a R$ ${precoBruto.toFixed(2)} isso daria `
            + `R$ ${(qtdCotada * precoComIPI).toFixed(2)}`,
        });
      }
    }

    return {
      codigo: l.codigoOmieItem || null,
      descricao: l.rmItem.descricao,
      unidade,
      qtd,
      precoUnit: precoComIPI,
    };
  });
  return { itens, alertas };
}

/**
 * Diferença entre o total da proposta informada e a soma dos itens — para AVISAR, nunca corrigir.
 * @returns {{ diferenca:number, pct:number, texto:string|null }}
 */
export function divergenciaProposta(totalProposta, totalItens, cobrePropostaInteira) {
  const tp = Number(totalProposta) || 0;
  const ti = Number(totalItens) || 0;
  // ⚠ em split o `totalProposta` é o total da proposta CHEIA e não tem relação com o subconjunto
  // que virou pedido: comparar aí acusaria divergência em pedido correto.
  if (!cobrePropostaInteira || tp <= 0 || ti <= 0) return { diferenca: 0, pct: 0, texto: null };
  const diferenca = tp - ti;
  const pct = diferenca / ti;
  if (Math.abs(diferenca) <= 0.01) return { diferenca: 0, pct: 0, texto: null };
  return {
    diferenca, pct,
    texto: `Total da proposta informada (R$ ${tp.toFixed(2)}) difere da soma dos itens `
      + `(R$ ${ti.toFixed(2)}) em ${(pct * 100).toFixed(1)}%`,
  };
}
