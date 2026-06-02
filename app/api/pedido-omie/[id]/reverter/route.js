import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// POST /api/pedido-omie/[id]/reverter
// Reverte um pedido de compra: marca como REVERTIDO, volta RMItems para COTADO,
// desmarca vencedores da cotacao, recalcula status da RM.
// O usuario DEVE cancelar o pedido manualmente no Omie antes de reverter aqui.

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);
    const { id } = await params;

    const pedido = await prisma.pedidoOmie.findUnique({
      where: { id },
      include: {
        rmItens: {
          select: { id: true, rmId: true, status: true },
        },
        cotacao: {
          select: {
            id: true,
            itens: {
              where: { vencedor: true },
              select: { id: true, rmItemId: true },
            },
          },
        },
      },
    });

    if (!pedido) {
      return NextResponse.json(
        { success: false, error: "Pedido nao encontrado" },
        { status: 404 }
      );
    }

    if (pedido.status === "REVERTIDO") {
      return NextResponse.json(
        { success: false, error: "Pedido ja foi revertido" },
        { status: 400 }
      );
    }

    // IDs dos RMItems vinculados a este pedido
    const rmItemIds = pedido.rmItens.map((i) => i.id);
    // IDs das RMs afetadas (pra recalcular status depois)
    const rmIdsAfetadas = [...new Set(pedido.rmItens.map((i) => i.rmId))];
    // IDs dos CotacaoItems vencedores que pertencem aos rmItems deste pedido
    const cotItemIdsParaDesmarcar = (pedido.cotacao?.itens || [])
      .filter((ci) => rmItemIds.includes(ci.rmItemId))
      .map((ci) => ci.id);

    // Executa tudo em transacao
    await prisma.$transaction(async (tx) => {
      // 1. Marca pedido como REVERTIDO
      await tx.pedidoOmie.update({
        where: { id },
        data: { status: "REVERTIDO" },
      });

      // 2. Volta RMItems para COTADO e desvincula do pedido
      if (rmItemIds.length > 0) {
        await tx.rMItem.updateMany({
          where: { id: { in: rmItemIds } },
          data: { status: "COTADO", pedidoOmieId: null },
        });
      }

      // 3. Desmarca vencedores da cotacao (libera pra escolher outro fornecedor)
      if (cotItemIdsParaDesmarcar.length > 0) {
        await tx.cotacaoItem.updateMany({
          where: { id: { in: cotItemIdsParaDesmarcar } },
          data: { vencedor: false },
        });
      }

      // 4. Recalcula status de cada RM afetada
      for (const rmId of rmIdsAfetadas) {
        const itensRM = await tx.rMItem.findMany({
          where: { rmId },
          select: { status: true },
        });
        const todosFinalizados = itensRM.every(
          (i) => ["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"].includes(i.status)
        );
        const algumCotado = itensRM.some((i) => i.status === "COTADO");
        const algumEmCotacao = itensRM.some((i) => i.status === "EM_COTACAO");

        let novoStatusRM;
        if (todosFinalizados && itensRM.length > 0) {
          novoStatusRM = "PEDIDO_GERADO";
        } else if (algumCotado) {
          novoStatusRM = "COTADA";
        } else if (algumEmCotacao) {
          novoStatusRM = "EM_COTACAO";
        } else {
          novoStatusRM = "ABERTA";
        }

        await tx.rM.update({
          where: { id: rmId },
          data: { status: novoStatusRM },
        });
      }

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "REVERTER_PEDIDO",
          entity: "PedidoOmie",
          entityId: id,
          diff: {
            pedidoNumero: pedido.numeroPedido,
            fornecedor: pedido.fornecedorNome,
            total: pedido.total,
            itensRevertidos: rmItemIds.length,
            vencedoresDesmarcados: cotItemIdsParaDesmarcar.length,
            rmsAfetadas: rmIdsAfetadas,
          },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status =
      e.message === "Unauthorized" ? 401 :
      e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json(
      { success: false, error: e.message },
      { status }
    );
  }
}
