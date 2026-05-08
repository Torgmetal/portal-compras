// Helpers pra montar URLs do Omie web — abrir pedidos/produtos diretamente.
// Se algum dia o pattern do Omie mudar, e so ajustar aqui.

const OMIE_BASE = "https://app.omie.com.br";

// Abre o detalhe do pedido de compra no Omie (SPA route).
// Pattern observado: /aplicativo/main/main.php#producao.pedidoCompra/{codigo_pedido}
// Se o Omie nao reconhecer, abre a tela inicial da listagem de pedidos de compra.
export function omiePedidoCompraUrl(codigoPedido) {
  if (!codigoPedido) return omiePedidoCompraListagemUrl();
  return `${OMIE_BASE}/aplicativo/main/main.php#producao.pedidoCompra/${codigoPedido}`;
}

// Listagem de pedidos de compra — fallback quando nao temos codigoPedido,
// ou quando o detalhe direto nao funciona.
export function omiePedidoCompraListagemUrl() {
  return `${OMIE_BASE}/aplicativo/main/main.php#estoque.pedidos.compra`;
}

export function omiePedidoCompraSearchUrl(numeroPedido) {
  // Mesmo URL da listagem — o usuario filtra pelo numero na tela
  return omiePedidoCompraListagemUrl();
}

// Fornecedor pelo codigo Omie
export function omieFornecedorUrl(nCodFor) {
  if (!nCodFor) return null;
  return `${OMIE_BASE}/aplicativo/main/main.php#cadastros.cliente/${nCodFor}`;
}
