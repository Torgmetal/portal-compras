// ─── BACKFILL DOS ITENS DO PEDIDO NO OMIE ────────────────────────────────────
//
// Pedido antigo pode estar no portal sem `itensOmie` preenchido — o campo só passou a ser
// gravado depois. Isto vai buscar os que faltam, de dez em dez, na carona do sync de entregas.
//
// ⚠⚠ É TRABALHO DE FUNDO, E TEM DE MORRER PRIMEIRO. Ele roda DEPOIS do laço principal, que é
// quem responde a pergunta da tela ("chegou ou não?"). Antes de 17/09/2026 o prazo era conferido
// só na ENTRADA daqui: passando por um fio, ele ainda gastava dez consultas ao Omie — com o
// orçamento já no fim, era ele quem estourava a rota, depois de o laço principal ter parado
// justamente para evitar isso (achado do Codex).
//
// ⚠ Nenhum erro daqui sobe. Item sem detalhe é informação a menos numa tela; sync que falha por
// causa dele é entrega que ninguém vê.
//
// ⚠ A consulta ao Omie CHEGA POR PARÂMETRO, não por import: quem a exporta é o próprio
// `omie-recebimento`, e importá-la de volta fecharia um ciclo entre os dois módulos. De quebra,
// o teste injeta a sua sem precisar de rede.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Os campos do item do Omie que o portal guarda em `PedidoOmie.itensOmie`. */
const itemDoOmie = (item) => {
  const prod = item.produto || item;
  return {
    descricao: prod.cDescricao || prod.cProduto || "",
    qtd: Number(prod.nQtde) || 0,
    unidade: prod.cUnidade || "KG",
    valorUnit: Number(prod.nValUnit) || 0,
    qtdRecebida: Number(prod.nQtdeRec) || 0,
  };
};

/**
 * Preenche `itensOmie` de até dez pedidos que ainda não o têm.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} fim  instante-limite absoluto (`Date.now()`); nada começa depois dele
 * @param {(codigo: string, opts: object) => Promise<object>} consultarPedido
 * @returns {Promise<number>} quantos pedidos foram preenchidos
 */
export async function backfillItensOmie(prisma, fim, consultarPedido) {
  const acabou = () => Number(fim) > 0 && Date.now() >= fim;
  if (acabou()) return 0;

  let preenchidos = 0;
  try {
    const semItens = await prisma.pedidoOmie.findMany({
      where: { codigoPedido: { not: null }, itensOmie: null, status: "CRIADO" },
      select: { id: true, codigoPedido: true, faturamentoDireto: true },
      take: 10,
    });

    for (const p of semItens) {
      // ⚠ A cada volta, não só na entrada: dez consultas ao Omie a 45s cada não cabem no que
      // sobrou do orçamento do sync.
      if (acabou()) break;
      if (p.faturamentoDireto) continue; // FD não tem itens de pedido de compra
      try {
        const omie = await consultarPedido(p.codigoPedido, { ateMs: fim });
        const itensOmie = (omie.produtos_consulta || omie.det || []).map(itemDoOmie);
        if (itensOmie.length > 0) {
          await prisma.pedidoOmie.update({ where: { id: p.id }, data: { itensOmie } });
          preenchidos++;
        }
        await sleep(350); // rate limit do Omie
      } catch {
        // silencia: backfill nunca bloqueia o sync principal
      }
    }
  } catch {
    // silencia
  }
  return preenchidos;
}
