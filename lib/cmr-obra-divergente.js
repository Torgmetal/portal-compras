// A OBRA DO CMR CONTRA A OBRA DO PEDIDO.
//
// ⚠⚠ POR QUE EXISTE. Vitor (07/09/2026): "tem tinta da Induscolor na rastreabilidade da OP 105 e
// não temos tinta Induscolor para essa obra". Estava certo — os R 261309/310/311 (INDUSLUX 170 +
// diluente, NF 25621) entraram como obra 105, e o pedido de compra deles, o 1871, é da OP-064
// PIPE RACK (RM T64-014-R00). A coluna de obra do CMR é digitada à mão no Almoxarifado; o portal
// já sabia a resposta certa e aceitava a errada calado.
//
// ⚠ AVISA, NÃO CORRIGE. Medido em 07/09/2026: de 484 linhas do CMR com pedido que o portal conhece,
// só 8 divergem — dois incidentes (NF 25621 e NF 43997, esta com 5 perfis lançados na 092 sendo do
// pedido 1677 da 097 Unipar). Erro raro não se conserta sozinho: a planilha é o registro ISO, e
// trocar a obra por conta própria esconderia o furo em vez de mostrá-lo. Quem decide é quem lançou.
//
// ⚠ Só compara quando os DOIS lados existem: pedido numérico (a planilha escreve "N/A", "N / A",
// "OR 15950") e pedido que o portal conhece com OP amarrada. Fora disso não há o que comparar, e
// silêncio é a resposta honesta.

/** Número da OP em forma comparável: "064", "64", "OP 0105" → "64", "105". */
const canon = (v) => {
  const m = String(v ?? "").match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
};

/**
 * Cruza linhas do CMR com o pedido de compra delas.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Array<{importRef?: string, nome?: string, opNumero?: string, pedidoCompra?: string, nfNumero?: string}>} linhas
 * @returns {Promise<Array<{R, produto, nf, pedido, obraCmr, obraPedido, obraNome}>>} só as divergentes
 */
export async function obrasDivergentesDoPedido(prisma, linhas) {
  const alvo = (linhas || []).filter((l) => /^\d+$/.test(String(l?.pedidoCompra || "").trim()) && canon(l?.opNumero));
  if (!alvo.length) return [];

  const pedidos = await prisma.pedidoOmie.findMany({
    where: { numeroPedido: { in: [...new Set(alvo.map((l) => String(l.pedidoCompra).trim()))] }, opId: { not: null } },
    select: { numeroPedido: true, opId: true },
  });
  if (!pedidos.length) return [];
  const ops = await prisma.oP.findMany({
    where: { id: { in: [...new Set(pedidos.map((p) => p.opId))] } },
    select: { id: true, numero: true, obra: true },
  });
  const opDe = new Map(ops.map((o) => [o.id, o]));
  const doPedido = new Map(pedidos.map((p) => [p.numeroPedido, opDe.get(p.opId)]).filter(([, o]) => o));

  const out = [];
  for (const l of alvo) {
    const op = doPedido.get(String(l.pedidoCompra).trim());
    if (!op) continue;
    if (canon(l.opNumero) === canon(op.numero)) continue;
    out.push({
      R: l.importRef || null, produto: l.nome || null, nf: l.nfNumero || null,
      pedido: String(l.pedidoCompra).trim(),
      obraCmr: l.opNumero, obraPedido: op.numero, obraNome: op.obra || null,
    });
  }
  return out;
}

/** Frase pronta para tela/PDF. Vazia quando não há divergência. */
export const frasesDivergencia = (divs) =>
  (divs || []).map((d) =>
    `R ${d.R}: lançado na OP-${d.obraCmr}, mas o pedido ${d.pedido} é da OP-${d.obraPedido}${d.obraNome ? ` (${d.obraNome})` : ""}`);
