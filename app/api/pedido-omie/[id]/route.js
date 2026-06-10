// DELETE /api/pedido-omie/[id]
// Exclui um pedido de compra do portal (ex.: registros criados só para teste
// na aba de entregas). Mesma limpeza do "reverter" (itens da RM voltam para
// COTADO, vencedores desmarcados, status da RM recalculado), mas o registro é
// APAGADO em vez de marcado REVERTIDO — some da aba de entregas.
//
// Guardas:
//  - bloqueia se houver recebimento de NF vinculado (recebimento real ≠ teste);
//  - NÃO cancela o pedido no Omie — se ele existir lá (codigoPedido), o
//    cancelamento no Omie é manual (mesma regra do reverter).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = params;
  const pedido = await prisma.pedidoOmie.findUnique({
    where: { id },
    include: {
      rmItens: { select: { id: true, rmId: true } },
      cotacao: {
        select: {
          id: true,
          itens: { where: { vencedor: true }, select: { id: true, rmItemId: true } },
        },
      },
      _count: { select: { recebimentos: true } },
    },
  });
  if (!pedido) {
    return NextResponse.json({ success: false, error: "Pedido não encontrado" }, { status: 404 });
  }
  if (pedido._count.recebimentos > 0) {
    return NextResponse.json(
      { success: false, error: "Este pedido tem recebimento de NF vinculado — não parece ser um teste. Use \"Reverter\" se precisar desfazê-lo." },
      { status: 409 }
    );
  }

  const rmItemIds = pedido.rmItens.map((i) => i.id);
  const rmIdsAfetadas = [...new Set(pedido.rmItens.map((i) => i.rmId))];
  const cotItemIdsParaDesmarcar = (pedido.cotacao?.itens || [])
    .filter((ci) => rmItemIds.includes(ci.rmItemId))
    .map((ci) => ci.id);

  await prisma.$transaction(async (tx) => {
    // 1. Itens da RM voltam para COTADO e se desvinculam do pedido
    if (rmItemIds.length > 0) {
      await tx.rMItem.updateMany({
        where: { id: { in: rmItemIds } },
        data: { status: "COTADO", pedidoOmieId: null },
      });
    }

    // 2. Desmarca vencedores da cotação (libera para escolher de novo)
    if (cotItemIdsParaDesmarcar.length > 0) {
      await tx.cotacaoItem.updateMany({
        where: { id: { in: cotItemIdsParaDesmarcar } },
        data: { vencedor: false },
      });
    }

    // 3. Recalcula status de cada RM afetada (mesma régua do reverter)
    for (const rmId of rmIdsAfetadas) {
      const itensRM = await tx.rMItem.findMany({ where: { rmId }, select: { status: true } });
      const todosFinalizados = itensRM.every((i) => ["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"].includes(i.status));
      const algumCotado = itensRM.some((i) => i.status === "COTADO");
      const algumEmCotacao = itensRM.some((i) => i.status === "EM_COTACAO");
      const novoStatusRM = todosFinalizados && itensRM.length > 0
        ? "PEDIDO_GERADO"
        : algumCotado ? "COTADA"
        : algumEmCotacao ? "EM_COTACAO"
        : "ABERTA";
      await tx.rM.update({ where: { id: rmId }, data: { status: novoStatusRM } });
    }

    // 4. Histórico de prazos não tem cascade — apaga antes do pedido
    await tx.prazoHistorico.deleteMany({ where: { pedidoId: id } });

    // 5. Auditoria com o snapshot (o registro some do banco)
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "EXCLUIR_PEDIDO",
        entity: "PedidoOmie",
        entityId: id,
        diff: {
          pedidoNumero: pedido.numeroPedido,
          codigoPedidoOmie: pedido.codigoPedido,
          fornecedor: pedido.fornecedorNome,
          total: pedido.total,
          statusEntrega: pedido.statusEntrega,
          criadoManualmente: pedido.criadoManualmente,
          itensLiberados: rmItemIds.length,
          vencedoresDesmarcados: cotItemIdsParaDesmarcar.length,
          rmsAfetadas: rmIdsAfetadas,
        },
      },
    });

    // 6. Apaga o pedido
    await tx.pedidoOmie.delete({ where: { id } });
  });

  return NextResponse.json({
    success: true,
    avisoOmie: pedido.codigoPedido
      ? `Atenção: o pedido ${pedido.numeroPedido || pedido.codigoPedido} pode existir no Omie — a exclusão aqui não cancela lá.`
      : null,
  });
}
