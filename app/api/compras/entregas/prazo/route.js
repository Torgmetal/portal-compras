// PATCH /api/compras/entregas/prazo — atualiza prazo de entrega de um pedido
// (postergacao informada pelo fornecedor). Registra historico completo.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  pedidoId: z.string().min(1, "pedidoId obrigatorio"),
  novoPrazo: z.string().min(1, "novoPrazo obrigatorio"),
  motivo: z.string().max(500).optional(),
});

export async function PATCH(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Dados invalidos: " + (e.issues?.[0]?.message || e.message) },
      { status: 400 }
    );
  }

  const novoPrazo = new Date(body.novoPrazo);
  if (isNaN(novoPrazo.getTime())) {
    return NextResponse.json(
      { success: false, error: "Data invalida" },
      { status: 400 }
    );
  }

  const pedido = await prisma.pedidoOmie.findUnique({
    where: { id: body.pedidoId },
    select: {
      id: true,
      prazoEntregaPrevisto: true,
      prazoOriginal: true,
      numeroPedido: true,
      codigoPedido: true,
    },
  });

  if (!pedido) {
    return NextResponse.json(
      { success: false, error: "Pedido nao encontrado" },
      { status: 404 }
    );
  }

  const prazoAnterior = pedido.prazoEntregaPrevisto;

  // Transacao: atualizar pedido + criar historico
  await prisma.$transaction(async (tx) => {
    // Se nunca teve postergacao, salvar o prazo original
    const updateData = {
      prazoEntregaPrevisto: novoPrazo,
    };
    if (!pedido.prazoOriginal && prazoAnterior) {
      updateData.prazoOriginal = prazoAnterior;
    }

    await tx.pedidoOmie.update({
      where: { id: pedido.id },
      data: updateData,
    });

    await tx.prazoHistorico.create({
      data: {
        pedidoId: pedido.id,
        prazoAnterior,
        prazoNovo: novoPrazo,
        motivo: body.motivo?.trim() || null,
        alteradoPorId: user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "ATUALIZAR_PRAZO_ENTREGA",
        entity: "PedidoOmie",
        entityId: pedido.id,
        diff: {
          prazoAnterior: prazoAnterior?.toISOString() || null,
          prazoNovo: novoPrazo.toISOString(),
          motivo: body.motivo?.trim() || null,
        },
      },
    });
  });

  return NextResponse.json({
    success: true,
    prazoAnterior,
    prazoNovo: novoPrazo,
  });
}
