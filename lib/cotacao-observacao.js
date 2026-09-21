// ─── A OBSERVAÇÃO QUE O FORNECEDOR ESCREVEU ──────────────────────────────────
//
// ⚠⚠ `Cotacao.observacao` NÃO É SÓ A OBSERVAÇÃO: a rota de submissão empilha três coisas num campo
// só, separadas por " | " — `Prazo de entrega: X | Pagamento: Y | <o que o fornecedor digitou>`.
// Mostrar o campo cru na tela de compras faria o texto do fornecedor aparecer grudado em dois
// rótulos que já têm lugar próprio; ignorá-lo, como a tela fazia até 16/09/2026, esconde 447
// respostas que alguém se deu ao trabalho de escrever.
//
// ⚠ A leitura vive aqui, e não dentro de uma tela, porque quem GRAVA (a rota) e quem LÊ (o portal
// do fornecedor e a tela de compras) precisam concordar no formato. Já havia uma cópia desta função
// dentro do formulário do fornecedor; esta é a mesma, num lugar onde as duas telas a enxergam.

/**
 * Separa a observação combinada nas três partes que a rota juntou.
 *
 * @param {string|null} obs
 * @returns {{prazoEntrega:string, condicaoPagamento:string, observacao:string}}
 */
export function parseObservacaoCotacao(obs) {
  if (!obs) return { prazoEntrega: "", condicaoPagamento: "", observacao: "" };
  const partes = String(obs).split(" | ");
  let prazoEntrega = "";
  let condicaoPagamento = "";
  const restos = [];
  for (const p of partes) {
    const m1 = p.match(/^Prazo de entrega:\s*(.+)$/);
    const m2 = p.match(/^Pagamento:\s*(.+)$/);
    if (m1) prazoEntrega = m1[1].trim();
    else if (m2) condicaoPagamento = m2[1].trim();
    // ⚠ Só entra o que tem letra ou número. Um pedaço que sobrou com um separador solto ("|") não
    // é observação de ninguém, e mostrá-lo na tela como resposta do fornecedor seria ruído com
    // cara de conteúdo.
    else if (/[\p{L}\p{N}]/u.test(p)) restos.push(p.trim());
  }
  // ⚠ O resto volta com " | " porque a observação do fornecedor PODE conter o separador; juntar de
  // novo devolve o texto dele inteiro em vez de só o primeiro pedaço.
  return { prazoEntrega, condicaoPagamento, observacao: restos.join(" | ") };
}

/** Tem alguma coisa escrita pelo fornecedor nesta cotação (fora prazo e pagamento)? */
export const temObservacaoDoFornecedor = (cotacao) =>
  Boolean(parseObservacaoCotacao(cotacao?.observacao).observacao)
  || (cotacao?.itens || []).some((i) => String(i.observacao || "").trim());

/**
 * A condição de pagamento de uma cotação, venha do campo que vier.
 *
 * ⚠⚠ SÃO DUAS FONTES, E A ORDEM IMPORTA. A rota de submissão grava a resposta do fornecedor nos
 * DOIS lugares — `Cotacao.prazoPagamento` e, de novo, dentro de `observacao` como "Pagamento: X".
 * Mas a cotação lançada à mão pela tela de compras (`ModalLancarManual`) preenche só o campo
 * próprio: lendo apenas a observação, justamente a que o comprador digitou sumiria da tela.
 *
 * Medido no acervo (16/09/2026): 435 das 672 cotações têm o campo próprio preenchido e NENHUMA
 * tem a condição só dentro da observação — o reserva existe para o formato antigo, não para o
 * acervo de hoje.
 */
export function condicaoPagamentoDe(cotacao) {
  const proprio = String(cotacao?.prazoPagamento || "").trim();
  return proprio || parseObservacaoCotacao(cotacao?.observacao).condicaoPagamento;
}
