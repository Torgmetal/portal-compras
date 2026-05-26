import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// POST /api/cotacao/[id]/cancelar
// Cancela uma cotacao: muda status para CANCELADA, desmarca vencedores,
// e recalcula status dos RMItems (se nao tem outra cotacao RECEBIDA, volta pra EM_COTACAO).

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

    // Verifica se algum item desta cotacao ja virou pedido
    const temPedido = await prisma.cotacaoItem.findFirst({
      where: {
        cotacaoId: id,
        vencedor: true,
        rmItem: { status: "PEDIDO_GERADO" },
      },
    });
    if (temPedido) {
      return NextResponse.json(
        { success: false, error: "Esta cotação tem itens que já viraram pedido. Reverta o pedido antes de cancelar a cotação." },
        { status: 400 }
      );
    }

    const rmItemIds = cotacao.itens.map((i) => i.rmItemId);
    const cotItemIds = cotacao.itens.map((i) => i.id);

    await prisma.$transaction(async (tx) => {
      // 1. Marca cotacao como CANCELADA
      await tx.cotacao.update({
        where: { id },
        data: { status: "CANCELADA" },
      });

      // 2. Desmarca vencedores desta cotacao
      await tx.cotacaoItem.updateMany({
        where: { id: { in: cotItemIds }, vencedor: true },
        data: { vencedor: false },
      });

      // 3. Recalcula status de cada RMItem afetado
      // Se o item tem outra cotacao RECEBIDA com preco > 0, fica COTADO
      // Se tem outra cotacao PENDENTE, fica EM_COTACAO
      // Senao, volta pra PENDENTE
      for (const rmItemId of rmItemIds) {
        const rmItem = await tx.rMItem.findUnique({
          where: { id: rmItemId },
          select: { status: true },
        });
        // Nao mexe em itens ja PEDIDO_GERADO ou CANCELADO (de outro pedido)
        if (!rmItem || rmItem.status === "PEDIDO_GERADO" || rmItem.status === "CANCELADO") {
          continue;
        }

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

      // 4. Recalcula status da RM
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

      // 5. Audit log
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
