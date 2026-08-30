import "server-only";
import { prisma } from "./prisma";

// ─── O STATUS DA RM DEPOIS DE GERAR PEDIDO ────────────────────────────────────
// Vitor (30/08/2026): "quando eu mando uma RM para compra e fica algum item que o fornecedor não
// [tem], a RM fica em 'pronta para pedido' mesmo que eu já tenha gerado o pedido no Omie dos itens
// que têm. Ela precisa voltar para as 'em aberto' nesse caso".
//
// ⚠⚠ O CASO DO MEIO NÃO EXISTIA. Os dois geradores faziam só: "se TODOS os itens finalizaram,
// RM = PEDIDO_GERADO" — e, quando sobrava item, não faziam nada. A RM ficava parada em COTADA, que
// a tela mostra como "Pronta" (pronta pra pedido). Ou seja: pedido já feito, mas a fila dizendo que
// ainda havia pedido a fazer, e o item que ninguém cotou sumindo de vista — some da lista de quem
// abre, some da lista de quem cota, e só reaparece quando a obra sente falta do material.
//
// A regra tem três saídas, não duas:
//   · todos finalizados            → PEDIDO_GERADO (a RM acabou)
//   · alguns sim, outros não       → ABERTA (volta para a fila: o que sobrou precisa de cotação)
//   · nenhum finalizado            → não mexe (nada aconteceu; provavelmente erro na geração)
//
// ⚠ A terceira saída importa: se a chamada ao Omie falhou e nada foi gerado, jogar a RM para ABERTA
// apagaria a cotação que já estava pronta e o comprador teria de refazer tudo.

const FINALIZADO = ["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"];

/**
 * Reavalia o status da RM a partir dos itens. Devolve o status aplicado, ou null se não mexeu.
 * @param {string} rmId
 * @returns {Promise<"PEDIDO_GERADO"|"ABERTA"|null>}
 */
export async function reavaliarStatusRM(rmId) {
  if (!rmId) return null;
  const itens = await prisma.rMItem.findMany({ where: { rmId }, select: { status: true } });
  if (!itens.length) return null;

  const finalizados = itens.filter((i) => FINALIZADO.includes(i.status)).length;
  if (finalizados === 0) return null;

  const novo = finalizados === itens.length ? "PEDIDO_GERADO" : "ABERTA";
  const rm = await prisma.rM.findUnique({ where: { id: rmId }, select: { status: true } });
  if (!rm || rm.status === novo || rm.status === "CANCELADA") return null;

  await prisma.rM.update({ where: { id: rmId }, data: { status: novo } });
  return novo;
}
