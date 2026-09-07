// A OBRA DO CMR CONTRA A OBRA DO PEDIDO.
//
// ⚠⚠ POR QUE EXISTE. Vitor (07/09/2026): "tem tinta da Induscolor na rastreabilidade da OP 105 e
// não temos tinta Induscolor para essa obra". Estava certo — os R 261309/310/311 (INDUSLUX 170 +
// diluente, NF 25621) entraram como obra 105, e o pedido de compra deles, o 1871, é da OP-064
// PIPE RACK (RM T64-014-R00). A coluna de obra do CMR é digitada à mão no Almoxarifado; o portal
// já sabia a resposta certa e aceitava a errada calado.
//
// ⚠⚠ DIVERGIR NÃO É ERRAR. Vitor, na mesma conversa: "pode ter sido usado de estoque, isso você já
// sabe que não é regra". Material comprado para uma obra é consumido em outra o tempo todo — para
// tinta ele já tinha dito que pode, "desde que bata a mesma especificação e cor". Então isto aqui é
// um SINAL, nunca um veredito, e o texto que sai na tela não pode acusar: diz o que se sabe (a nota
// entrou pelo pedido de outra obra) e deixa a conclusão para quem lançou.
//
// ⚠ E o portal não tem como desempatar sozinho: `EstoqueAlocacao` está vazia (conferido em
// 07/09/2026), então não existe registro de consumo de estoque para confrontar. Enquanto não
// existir, nenhuma automação aqui pode ir além de relatar.
//
// ⚠ AVISA, NÃO CORRIGE. Medido em 07/09/2026: de 484 linhas do CMR com pedido que o portal conhece,
// só 8 divergem — dois incidentes (NF 25621 e NF 43997, esta com 5 perfis lançados na 092 sendo do
// pedido 1677 da 097 Unipar). A planilha é o registro ISO: trocar a obra por conta própria
// esconderia o furo em vez de mostrá-lo, e apagaria um consumo de estoque legítimo.
//
// (No caso que originou isto a resposta veio do Vitor, não do dado: "a tinta eu tenho certeza que
// não foi usada — não pode ser essa tinta, e nem chegou a tinta dessa OP ainda". Erro de digitação
// mesmo. Mas é ele quem sabe; o portal só levantou a pergunta.)
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

/** Frase pronta para tela/PDF. Vazia quando não há divergência.
 *  ⚠ Relata, não acusa: consumo de estoque de outra obra é legítimo e não fica registrado. */
export const frasesDivergencia = (divs) =>
  (divs || []).map((d) =>
    `R ${d.R} está na OP-${d.obraCmr}, mas entrou pelo pedido ${d.pedido}, da OP-${d.obraPedido}${d.obraNome ? ` (${d.obraNome})` : ""} — consumo de estoque ou obra trocada no lançamento?`);
