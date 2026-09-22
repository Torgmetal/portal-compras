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

import { unidadeEfetivaDoItem } from "@/lib/unidades";

/** faixa em que a diferença entre peso da RM e quantidade cotada ainda é lote mínimo/sobra */
const RAZAO_MIN = 1 / 3;
const RAZAO_MAX = 3;

/**
 * Duas casas — dinheiro e imposto não carregam dízima adiante.
 *
 * ⚠ `+ Number.EPSILON` porque `841,995 × 100` em ponto flutuante dá 84199,499…, e `Math.round`
 * devolveria 841,99 num número que o Omie mostra como 842,00. Um centavo de diferença num item
 * vira divergência de conferência contra a nota.
 */
const arredondar = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;

/**
 * A quantidade que vai ao pedido.
 *
 * ⚠ O fallback existe para o fornecedor que respondeu sem preencher a quantidade: aí vale o
 * líquido do abatimento de estoque (quando houve consulta) e, por último, o peso da RM.
 */
function quantidadeDoItem({ cotItem, rmItem }) {
  const qtdCotada = Number(cotItem.qtdCotada) || 0;
  if (qtdCotada > 0) return qtdCotada;
  const pesoRm = Number(rmItem.peso) || 0;
  const qtdRm = Number(rmItem.qtd) || 0;
  if (cotItem.qtdPecasCotada != null) {
    return pesoRm > 0 && qtdRm > 0
      ? Math.round((pesoRm * Number(cotItem.qtdPecasCotada) / qtdRm) * 100) / 100
      : Number(cotItem.qtdPecasCotada) || 0;
  }
  return pesoRm > 0 ? pesoRm : 0;
}

/**
 * ⚠⚠ O VERIFICADOR DA QUANTIDADE. Quantidade e peso na MESMA ordem de grandeza é lote mínimo e
 * passa direto — é o caso de 111 dos 136 itens divergentes da base. Fora da faixa, a quantidade
 * quase sempre está na unidade do fornecedor com o rótulo de kg (13,28 barras marcadas como
 * 13,28 KG), e aí quem decide é uma pessoa: o portal avisa em vez de adivinhar.
 */
function alertaDeQuantidade(l, precoComIPI) {
  const pesoRm = Number(l.rmItem.peso) || 0;
  const qtdCotada = Number(l.cotItem.qtdCotada) || 0;
  if (!(pesoRm > 0 && qtdCotada > 0)) return null;
  const r = pesoRm / qtdCotada;
  if (r <= RAZAO_MAX && r >= RAZAO_MIN) return null;
  const preco = Number(l.cotItem.precoUnit) || 0;
  return {
    marca: l.rmItem.codigo || null,
    descricao: l.rmItem.descricao || "",
    motivo: `cotado ${qtdCotada} contra ${pesoRm} kg na RM (${r.toFixed(1)}x) — confira se a quantidade `
      + `está em kg ou na unidade do fornecedor; a R$ ${preco.toFixed(2)} isso daria `
      + `R$ ${(qtdCotada * precoComIPI).toFixed(2)}`,
  };
}

/**
 * @param {{cotItem:object, rmItem:object, codigoOmieItem?:string}[]} linhas
 * @returns {{ itens: object[], alertas: {marca?:string, descricao:string, motivo:string}[] }}
 */
export function itensDoPedido(linhas) {
  const alertas = [];
  const itens = (linhas || []).map((l) => {
    const precoUnit = Number(l.cotItem.precoUnit) || 0;
    const ipiPct = Number(l.cotItem.ipiPct) || 0;
    const qtd = quantidadeDoItem(l);

    // ⚠⚠ O IPI SAI SEPARADO, NÃO EMBUTIDO NO PREÇO (Matheus, 16/09/2026). Até aqui saía
    // `precoUnit × (1 + ipi)` como valor unitário e o campo de IPI do Omie ficava ZERADO: o rufo da
    // T118-006-R00 chegou ao pedido 2077 como 42,714 (40,68 × 1,05) com IPI 0,00, e o mesmo vale
    // para os 114 pedidos gerados a partir de cotação com IPI. Fiscalmente o pedido de compra quer
    // o preço LÍQUIDO e o imposto destacado — foi assim que o Matheus consertou o 2077 à mão, e só
    // então ele bateu com o PDF do fornecedor (base 44.255,78 + IPI 228,26 = 44.484,04).
    //
    // ⚠ O TOTAL NÃO MUDA, muda onde o imposto aparece: `precoUnit × qtd + valorIpi` é exatamente o
    // que `precoComIPI × qtd` dava antes. Quem soma o total precisa somar os dois — por isso o
    // item leva `totalComImpostos` pronto, em vez de cada consumidor refazer a conta e um deles
    // esquecer.
    // ⚠⚠ A BASE É ARREDONDADA ANTES DE APLICAR A ALÍQUOTA — é o que o Omie faz, e conferi contra
    // as 11 linhas com IPI do pedido 2077. O rufo dentado é o caso que separa as duas contas:
    // 26,73 × 31,5 = 841,995; sobre o valor cru o IPI dá 27,36, sobre a base arredondada (842,00)
    // dá 27,37 — e 27,37 é o que está no Omie. Calcular diferente do ERP faz o portal e a nota
    // discordarem em centavos justamente nos itens de quantidade fracionada.
    const baseItem = arredondar(precoUnit * qtd);
    const valorIpi = arredondar(baseItem * (ipiPct / 100));

    // ⚠ A UNIDADE É A QUE O FORNECEDOR VIU NO PORTAL, e ela é decidida do mesmo jeito lá
    // (CotacaoFornecedorForm: `usaKg = pesoRm > 0`). Rotular de outro jeito faria o Omie receber
    // quantidade numa base e nome noutra.
    const unidade = unidadeEfetivaDoItem(l.rmItem);

    const aviso = alertaDeQuantidade(l, precoUnit * (1 + ipiPct / 100));
    if (aviso) alertas.push(aviso);

    return {
      codigo: l.codigoOmieItem || null,
      descricao: l.rmItem.descricao,
      unidade,
      qtd,
      precoUnit,
      ipiPct,
      valorIpi,
      totalComImpostos: arredondar(baseItem + valorIpi),
      // ⚠ A observação que a engenharia escreveu no item vai junto para o Omie (Matheus,
      // 16/09/2026: "quando colocarmos observações nos itens é importante sair na observação do
      // item no pedido de compra no Omie também"). É a mesma que o fornecedor já lê na cotação.
      observacao: String(l.rmItem.observacao || "").trim() || null,
    };
  });
  return { itens, alertas };
}

/** O total do pedido — base + impostos destacados. Uma conta só, para as duas rotas de geração. */
export const totalDosItens = (itens) =>
  arredondar((itens || []).reduce((s, it) => s + (Number(it.totalComImpostos) || 0), 0));

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
