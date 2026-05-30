import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ajustarQuantidadesPedido } from "@/lib/omie-pedido-compra";

// POST — Ajusta quantidades do pedido de compra no Omie pra igualar ao
// recebimento real (NF). Resolve diferenca entre peso teorico e real.
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);
    const body = await req.json();
    const { pedidoId } = body;

    if (!pedidoId) {
      return NextResponse.json(
        { success: false, error: "pedidoId obrigatório" },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoOmie.findUnique({
      where: { id: pedidoId },
      select: {
        id: true,
        codigoPedido: true,
        numeroPedido: true,
        fornecedorNome: true,
      },
    });

    if (!pedido) {
      return NextResponse.json(
        { success: false, error: "Pedido não encontrado" },
        { status: 404 }
      );
    }

    if (!pedido.codigoPedido) {
      return NextResponse.json(
        { success: false, error: "Pedido sem código Omie vinculado" },
        { status: 400 }
      );
    }

    const resultado = await ajustarQuantidadesPedido(pedido.codigoPedido);

    if (resultado.error) {
      return NextResponse.json(
        { success: false, error: resultado.error, detalhes: resultado.ajustes || [] },
        { status: 422 }
      );
    }

    // Registra no audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "AJUSTAR_PEDIDO_OMIE",
        entity: "PedidoOmie",
        entityId: pedidoId,
        diff: {
          numeroPedido: pedido.numeroPedido,
          fornecedor: pedido.fornecedorNome,
          ajustados: resultado.ajustados,
          ajustes: resultado.ajustes,
        },
      },
    });

    return NextResponse.json({
      success: true,
      ajustados: resultado.ajustados,
      ajustes: resultado.ajustes,
      mensagem: resultado.mensagem || `${resultado.ajustados} item(ns) ajustado(s) no Omie`,
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
