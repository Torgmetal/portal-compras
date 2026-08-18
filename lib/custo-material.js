import { prisma } from "@/lib/prisma";

// Resolve o CUSTO UNITÁRIO (preço de compra) de produtos do Omie, por código.
// Fontes, em ordem de prioridade:
//   1) PEDIDO DE COMPRA — cotação vencedora mais recente do produto (preço realmente
//      pago): RMItem.codigoOmieEstoque (ou .codigo) → CotacaoItem(vencedor).precoUnit.
//   2) ESTOQUE — custo médio (EstoqueItem.cmc), quando > 0.
// Retorna um mapa { [codigo]: { valorUnit, fonte } } só com os que resolveu.
export async function resolverCustoPorCodigo(codigos = []) {
  const res = {};
  const unicos = [...new Set(codigos.filter(Boolean).map(String))];
  if (unicos.length === 0) return res;

  // 1) cotação vencedora mais recente por código
  const rmItens = await prisma.rMItem.findMany({
    where: {
      OR: [{ codigoOmieEstoque: { in: unicos } }, { codigo: { in: unicos } }],
      cotacaoItens: { some: { vencedor: true } },
    },
    select: {
      codigoOmieEstoque: true,
      codigo: true,
      cotacaoItens: {
        where: { vencedor: true },
        select: { precoUnit: true, cotacao: { select: { createdAt: true } } },
      },
    },
  });
  const maisRecente = {}; // codigo -> { preco, ts }
  for (const it of rmItens) {
    const cod = it.codigoOmieEstoque || it.codigo;
    if (!cod) continue;
    for (const ci of it.cotacaoItens) {
      const ts = ci.cotacao?.createdAt?.getTime?.() || 0;
      if (ci.precoUnit > 0 && (!maisRecente[cod] || ts > maisRecente[cod].ts)) {
        maisRecente[cod] = { preco: ci.precoUnit, ts };
      }
    }
  }
  for (const [cod, v] of Object.entries(maisRecente)) res[cod] = { valorUnit: v.preco, fonte: "compra" };

  // 2) custo médio do estoque para os que faltaram
  const faltam = unicos.filter((c) => !res[c]);
  if (faltam.length) {
    const est = await prisma.estoqueItem.findMany({
      where: { codigoOmie: { in: faltam }, cmc: { gt: 0 } },
      select: { codigoOmie: true, cmc: true },
    });
    for (const e of est) res[e.codigoOmie] = { valorUnit: e.cmc, fonte: "estoque" };
  }
  return res;
}
