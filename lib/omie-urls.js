// Helpers pra montar URLs do Omie web — abrir pedidos/produtos diretamente.
//
// Padrao do Omie pro tenant Torg:
//   https://app.omie.com.br/gestao/torg-5mos4yik/#COM   (modulo Compras)
//
// ⚠⚠ NÃO EXISTE PDF DE PEDIDO NA API DO OMIE. Estes comentários diziam que a rota
// `/api/omie/pedido-compra-pdf/[codigoPedido]` chamava `ObterImpressaoPedCompra` e devolvia o PDF;
// verificado em 17/09/2026, esse método NÃO EXISTE — nem ele nem nenhuma das outras seis variantes
// que a rota tentava. O endpoint `produtos/pedidocompra/` tem seis métodos (Incluir, Alterar,
// Consultar, Excluir, Pesquisar, Upsert) e nenhum imprime. O de pedido de venda também não.
// Enquanto isso não mudar, o máximo honesto é levar ao módulo de Compras do Omie.

const OMIE_BASE = "https://app.omie.com.br";
const OMIE_TENANT = process.env.NEXT_PUBLIC_OMIE_TENANT || "torg-5mos4yik";

// URL da home do tenant
export function omieHomeUrl() {
  return `${OMIE_BASE}/gestao/${OMIE_TENANT}/`;
}

// Modulo de Compras (lista de pedidos)
export function omiePedidoCompraListagemUrl() {
  return `${OMIE_BASE}/gestao/${OMIE_TENANT}/#COM`;
}

/**
 * Onde clicar num pedido leva: o módulo de Compras do Omie.
 *
 * ⚠ Vai DIRETO ao Omie, sem passar pela nossa rota. O desvio existia para gerar um PDF que a API
 * não sabe gerar, e cobrava sete chamadas ao Omie por clique (limite de 3 req/s, o mesmo dos
 * crons). O `codigoPedido` continua no argumento porque a assinatura é usada em vários lugares e
 * volta a ser útil no dia em que houver deep link de verdade.
 */
export function omiePedidoCompraUrl(_codigoPedido) {
  return omiePedidoCompraListagemUrl();
}

export function omiePedidoCompraSearchUrl(_numeroPedido) {
  return omiePedidoCompraListagemUrl();
}

// Cadastro de fornecedor — modulo CAD do Omie
export function omieFornecedorUrl(_nCodFor) {
  return `${OMIE_BASE}/gestao/${OMIE_TENANT}/#CAD`;
}
