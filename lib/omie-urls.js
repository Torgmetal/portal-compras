// Helpers pra montar URLs do Omie web — abrir pedidos/produtos diretamente.
//
// IMPORTANTE: nao temos confirmacao do pattern exato do Omie pra abrir
// pedido especifico via URL. Por enquanto, abrimos a aplicacao principal
// (que cai na home do Omie ou login) e o usuario navega manualmente.
// Quando tivermos a URL real, e so ajustar omiePedidoCompraUrl pra deep-link.

const OMIE_BASE = "https://app.omie.com.br";

export function omiePedidoCompraUrl(_codigoPedido) {
  // Por enquanto so abre o Omie — usuario busca pelo numero na tela
  return `${OMIE_BASE}/aplicativo/main/main.php`;
}

export function omiePedidoCompraListagemUrl() {
  return `${OMIE_BASE}/aplicativo/main/main.php`;
}

export function omiePedidoCompraSearchUrl(_numeroPedido) {
  return `${OMIE_BASE}/aplicativo/main/main.php`;
}

export function omieFornecedorUrl(_nCodFor) {
  return `${OMIE_BASE}/aplicativo/main/main.php`;
}
