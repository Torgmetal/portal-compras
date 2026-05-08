// Helpers pra montar URLs do Omie web — abrir pedidos/produtos diretamente.
//
// Padrao do Omie pro tenant Torg:
//   https://app.omie.com.br/gestao/torg-5mos4yik/#COM   (modulo Compras)
//
// Pra PDF do pedido, usar a API: GET /api/omie/pedido-compra-pdf/[codigoPedido]
// (rota nossa) que chama Omie 'ObterImpressaoPedCompra' e redireciona pro PDF.

const OMIE_BASE = "https://app.omie.com.br";
const OMIE_TENANT = process.env.NEXT_PUBLIC_OMIE_TENANT || "torg-5mos4yik";

// URL da home do tenant — usado como fallback quando nao temos PDF
export function omieHomeUrl() {
  return `${OMIE_BASE}/gestao/${OMIE_TENANT}/`;
}

// Modulo de Compras (lista de pedidos)
export function omiePedidoCompraListagemUrl() {
  return `${OMIE_BASE}/gestao/${OMIE_TENANT}/#COM`;
}

// Pra abrir um pedido especifico, o caminho e via PDF gerado pela API.
// O componente PedidosOmieSection ja chama /api/omie/pedido-compra-pdf/[codigoPedido]
// que faz o redirect. Esta funcao retorna so a URL do PDF endpoint nosso.
export function omiePedidoCompraUrl(codigoPedido) {
  if (!codigoPedido) return omiePedidoCompraListagemUrl();
  return `/api/omie/pedido-compra-pdf/${codigoPedido}`;
}

export function omiePedidoCompraSearchUrl(_numeroPedido) {
  return omiePedidoCompraListagemUrl();
}

// Cadastro de fornecedor — modulo CAD do Omie
export function omieFornecedorUrl(_nCodFor) {
  return `${OMIE_BASE}/gestao/${OMIE_TENANT}/#CAD`;
}
