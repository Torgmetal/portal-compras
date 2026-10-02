// ─── O PRAZO DE ENTREGA DE UM PEDIDO, FORA DOS PRAZOS DAS RMs ─────────────────
//
// Matheus (02/10/2026): "na tela de OPs, em cada OP tem a lista de pedidos de compra — precisamos
// incluir uma coluna com o prazo de entrega que fica lá em Prazos das RMs; utilize o número do
// pedido para vincular". O prazo mora no próprio `PedidoOmie` (e no histórico de remarcação dele),
// então o vínculo pelo número é direto.
//
// ⚠⚠ A CONTA NÃO SE REPETE AQUI: é `situacaoDoPedido`, a mesma de Prazos das RMs. A data pode vir
// de quatro lugares (última remarcação, prazo do pedido, prazo dos itens da cotação, prazo escrito
// em palavras) — uma conta própria aqui discordaria da outra tela no primeiro pedido remarcado.
import { situacaoDoPedido } from "./painel-prazos-rm";

/**
 * O que `situacaoDoPedido` lê do pedido. ⚠ Os mesmos campos que `app/api/compras/prazos-rm` busca
 * para a previsão — quem acrescentar uma fonte de data lá precisa acrescentar aqui também.
 */
export const CAMPOS_PRAZO_PEDIDO = {
  numeroPedido: true, createdAt: true,
  prazoEntregaPrevisto: true, statusEntrega: true, dataEntregaReal: true, recebidoEm: true,
  encerradoOmieEm: true,
  recebidoPor: { select: { name: true } },
  prazoHistorico: { select: { prazoAnterior: true, prazoNovo: true, motivo: true, criadoEm: true }, orderBy: { criadoEm: "asc" } },
  acompanhamentos: { select: { etapa: true, data: true, observacao: true }, orderBy: { data: "asc" } },
  cotacao: { select: { observacao: true, itens: { where: { vencedor: true }, select: { prazoEntrega: true, vencedor: true } } } },
};

/**
 * A previsão que vale e a situação, enxutas para uma tabela.
 * ⚠ `previsao` sai como "aaaa-mm-dd": prazo é DIA, e formatar o instante em São Paulo mostraria o
 * dia anterior (meia-noite UTC ainda é ontem lá — ver a regra de Prazos das RMs).
 */
export function prazoDoPedido(pedido, agora = Date.now()) {
  const { situacao, previsao, diasAte, porEncerramento } = situacaoDoPedido(pedido, agora);
  return {
    previsao: previsao ? new Date(previsao).toISOString().slice(0, 10) : null,
    situacao,
    diasAte: diasAte ?? null,
    // ⚠ "chegou" por encerramento no Omie, não por NF: a coluna Status da OP (que lê só a NF) ainda
    // diz "Aguardando" — sem a procedência, as duas colunas pareceriam se contradizer.
    porEncerramento: !!porEncerramento,
  };
}
