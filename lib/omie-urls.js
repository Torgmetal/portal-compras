// Helpers pra montar URLs do Omie web — abrir pedidos/produtos diretamente.
// Se algum dia o pattern do Omie mudar, e so ajustar aqui.

const OMIE_BASE = "https://app.omie.com.br";

// Abre um pedido de compra no Omie pelo seu codigo (codigoPedido retornado
// pela API Omie ao criar). O Omie usa esse codigo como nCodPed.
export function omiePedidoCompraUrl(codigoPedido) {
  if (!codigoPedido) return null;
  return `${OMIE_BASE}/admin/pedido-de-compra/?nCodPed=${codigoPedido}`;
}

// Fallback — se nao temos codigoPedido (so numeroPedido), abre listagem
// filtrada pelo numero. O usuario clica no item da lista pra abrir.
export function omiePedidoCompraSearchUrl(numeroPedido) {
  if (!numeroPedido) return null;
  return `${OMIE_BASE}/admin/pedido-de-compra/?cNumero=${encodeURIComponent(numeroPedido)}`;
}

// Fornecedor pelo codigo Omie
export function omieFornecedorUrl(nCodFor) {
  if (!nCodFor) return null;
  return `${OMIE_BASE}/admin/cliente/?codigo_cliente=${nCodFor}`;
}
