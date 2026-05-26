import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// POST /api/cotacao/[id]/cancelar
// Cancela uma cotacao: muda status para CANCELADA, desmarca vencedores,
// reverte pedidos vinculados (marca como REVERTIDO), e recalcula status
// dos RMItems e da RM. Tudo em uma transacao so.

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);
    const { id } = await params;

    const cotacao = await prisma.cotacao.findUnique({
      where: { id },
      include: {
        itens: {
          select: { id: true, rmItemId: true, vencedor: true },
        },
        pedidosOmie: {
          where: { status: "CRIADO" },
          select: { id: true, numeroPedido: true, fornecedorNome: true, total: true },
        },
      },
    });

    if (!cotacao) {
      return NextResponse.json(
        { success: false, error: "Cotação não encontrada" },
        { status: 404 }
      );
    }

    if (cotacao.status === "CANCELADA") {
      return NextResponse.json(
        { success: false, error: "Cotação já está cancelada" },
        { status: 400 }
      );
    }

    const rmItemIds = cotacao.itens.map((i) => i.rmItemId);
    const cotItemIds = cotacao.itens.map((i) => i.id);
    const pedidosParaReverter = cotacao.pedidosOmie || [];

    await prisma.$transaction(async (tx) => {
      // 1. Reverte pedidos vinculados a esta cotacao (se houver)
      for (const pedido of pedidosParaReverter) {
        // Busca RMItems vinculados a este pedido
        const itensDoPedido = await tx.rMItem.findMany({
          where: { pedidoOmieId: pedido.id },
          select: { id: true },
        });
        const pedidoRmItemIds = itensDoPedido.map((i) => i.id);

        // Marca pedido como REVERTIDO
        await tx.pedidoOmie.update({
          where: { id: pedido.id },
          data: { status: "REVERTIDO" },
        });

        // Desvincula RMItems do pedido (status sera recalculado abaixo)
        if (pedidoRmItemIds.length > 0) {
          await tx.rMItem.updateMany({
            where: { id: { in: pedidoRmItemIds } },
            data: { pedidoOmieId: null },
          });
        }

        // Audit do pedido revertido
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "REVERTER_PEDIDO",
            entity: "PedidoOmie",
            entityId: pedido.id,
            diff: {
              pedidoNumero: pedido.numeroPedido,
              fornecedor: pedido.fornecedorNome,
              total: pedido.total,
              motivo: "Cancelamento da cotação",
              itensRevertidos: pedidoRmItemIds.length,
            },
          },
        });
      }

      // 2. Marca cotacao como CANCELADA
      await tx.cotacao.update({
        where: { id },
        data: { status: "CANCELADA" },
      });

      // 3. Desmarca vencedores desta cotacao
      await tx.cotacaoItem.updateMany({
        where: { id: { in: cotItemIds }, vencedor: true },
        data: { vencedor: false },
      });

      // 4. Recalcula status de cada RMItem afetado
      for (const rmItemId of rmItemIds) {
        const rmItem = await tx.rMItem.findUnique({
          where: { id: rmItemId },
          select: { status: true, pedidoOmieId: true },
        });
        // Nao mexe em itens CANCELADO ou que ainda apontam pra outro pedido ativo
        if (!rmItem || rmItem.status === "CANCELADO") continue;
        // Se o item aponta pra outro pedido (nao desta cotacao), nao mexe
        if (rmItem.pedidoOmieId) continue;

        // Busca outras cotacoes (nao canceladas) que cotaram este item
        const outrasCotacoes = await tx.cotacaoItem.findMany({
          where: {
            rmItemId,
            cotacaoId: { not: id },
            cotacao: { status: { not: "CANCELADA" } },
          },
          include: {
            cotacao: { select: { status: true } },
          },
        });

        const temRecebidaComPreco = outrasCotacoes.some(
          (ci) => ci.cotacao.status === "RECEBIDA" && (ci.precoUnit || 0) > 0
        );
        const temPendente = outrasCotacoes.some(
          (ci) => ci.cotacao.status === "PENDENTE"
        );

        let novoStatus;
        if (temRecebidaComPreco) {
          novoStatus = "COTADO";
        } else if (temPendente) {
          novoStatus = "EM_COTACAO";
        } else {
          novoStatus = "PENDENTE";
        }

        await tx.rMItem.update({
          where: { id: rmItemId },
          data: { status: novoStatus },
        });
      }

      // 5. Recalcula status da RM
      const rmId = cotacao.rmId;
      const itensRM = await tx.rMItem.findMany({
        where: { rmId },
        select: { status: true },
      });
      const todosFinalizados = itensRM.every(
        (i) => i.status === "PEDIDO_GERADO" || i.status === "CANCELADO"
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

      // 6. Audit log da cotacao
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CANCELAR_COTACAO",
          entity: "Cotacao",
          entityId: id,
          diff: {
            fornecedor: cotacao.fornecedorNome,
            statusAnterior: cotacao.status,
            total: cotacao.total,
            itens: rmItemIds.length,
            pedidosRevertidos: pedidosParaReverter.map((p) => p.numeroPedido),
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      pedidosRevertidos: pedidosParaReverter.length,
    });
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
