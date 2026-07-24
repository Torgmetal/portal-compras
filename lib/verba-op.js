import "server-only";

// Um pedido "consome verba" quando já é um custo firme — mesma regra da
// aba comercial (app/comercial/[id]/page.js): CRIADO conta sempre; manual
// PENDENTE_OMIE/ERRO conta (já foi decidido comprar); CANCELADO nunca.
const consomeVerba = (p) => {
  if (p.status === "CANCELADO") return false;
  if (p.status === "CRIADO") return true;
  if (p.criadoManualmente && (p.status === "PENDENTE_OMIE" || p.status === "ERRO")) return true;
  return false;
};

/**
 * Verba de material da OP: orçado (Σ OPItem.valorVerba) − comprometido (pedidos
 * que consomem verba) = disponível pra compra. Espelha a comercial.
 * @param op       { itens:[{categoria,valorVerba}], aditivos:[{itens:[...]}] }
 * @param pedidos  pedidos DA OP inteira: [{ total, status, criadoManualmente }]
 * @returns { verbaTotal, totalEmPedidos, saldo, porCategoria:[{categoria,orcado}] }
 */
export function calcularVerbaOP(op, pedidos = []) {
  const opItens = [
    ...(op?.itens || []).map((i) => ({ categoria: i.categoria, valorVerba: i.valorVerba || 0 })),
    ...(op?.aditivos || []).flatMap((a) => (a.itens || []).map((i) => ({ categoria: i.categoria, valorVerba: i.valorVerba || 0 }))),
  ];
  const orcadoPorCat = {};
  for (const it of opItens) {
    if (!it.categoria) continue;
    orcadoPorCat[it.categoria] = (orcadoPorCat[it.categoria] || 0) + it.valorVerba;
  }
  const verbaTotal = Object.values(orcadoPorCat).reduce((s, v) => s + v, 0);
  const totalEmPedidos = (pedidos || []).filter(consomeVerba).reduce((s, p) => s + (p.total || 0), 0);
  const porCategoria = Object.entries(orcadoPorCat)
    .map(([categoria, orcado]) => ({ categoria, orcado }))
    .sort((a, b) => b.orcado - a.orcado);
  return { verbaTotal, totalEmPedidos, saldo: verbaTotal - totalEmPedidos, porCategoria };
}
