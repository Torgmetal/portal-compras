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
//
// ⚠⚠ "SOBROU ITEM" NÃO É "SOBROU ITEM SEM COTAÇÃO" (Matheus, 25/09/2026). A T105-009 tinha 4 itens
// COTADOS e 1 atendido pelo estoque — e voltou para ABERTA quando outro pedido da mesma OP foi
// gerado, porque a regra contava o estoque como finalizado e mandava o resto de volta para a fila de
// cotação. Os 4 já tinham proposta. A regra do Vitor é sobre o item que o fornecedor NÃO tem, e esse
// fica em EM_COTACAO (`cotacao/submeter` só marca COTADO item com preço). Então:
//   · sobrou algum PENDENTE/EM_COTACAO (ou status desconhecido) → ABERTA
//   · sobraram SÓ itens COTADO                                   → COTADA (pronta pra pedido)
// ⚠ Difere de propósito do `pedido-omie/[id]/reverter`, que põe COTADA quando há QUALQUER COTADO —
// lá é desfazer um pedido; aqui, COTADO misturado com item sem proposta tem que voltar à fila.

const FINALIZADO = ["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"];

/**
 * O status que a RM deve ter, pelos itens (puro). null = não mexer.
 * @param {Array<{status: string}>} itens
 * @returns {"PEDIDO_GERADO"|"ABERTA"|"COTADA"|null}
 */
export function statusAposFinalizar(itens) {
  if (!itens?.length) return null;
  const restantes = itens.filter((i) => !FINALIZADO.includes(i.status));
  if (restantes.length === itens.length) return null;
  if (restantes.length === 0) return "PEDIDO_GERADO";
  return restantes.every((i) => i.status === "COTADO") ? "COTADA" : "ABERTA";
}

/**
 * Reavalia o status da RM a partir dos itens. Devolve o status aplicado, ou null se não mexeu.
 * @param {string} rmId
 * @returns {Promise<"PEDIDO_GERADO"|"ABERTA"|null>}
 */
export async function reavaliarStatusRM(rmId) {
  if (!rmId) return null;
  const itens = await prisma.rMItem.findMany({ where: { rmId }, select: { status: true } });
  const novo = statusAposFinalizar(itens);
  if (!novo) return null;

  const rm = await prisma.rM.findUnique({ where: { id: rmId }, select: { status: true } });
  if (!rm || rm.status === novo || rm.status === "CANCELADA") return null;

  // ⚠ Condicionado ao status LIDO: se outra chamada mudou a RM no meio, esta não passa por cima.
  const r = await prisma.rM.updateMany({ where: { id: rmId, status: rm.status }, data: { status: novo } });
  return r.count ? novo : null;
}
