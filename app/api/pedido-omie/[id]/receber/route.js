import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  nfNumero: z.string().min(1, "Numero da NF obrigatorio"),
  nfSerie: z.string().optional().nullable(),
  nfChave: z.string().optional().nullable(),
  dataRecebimento: z.string().optional(), // ISO date string
  observacao: z.string().optional().nullable(),
});

// POST /api/pedido-omie/[id]/receber
// Marca um pedido de compra como recebido, registrando NF e data.
export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);
    const { id } = await params;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados invalidos" },
        { status: 400 }
      );
    }

    const { nfNumero, nfSerie, nfChave, dataRecebimento, observacao } = parsed.data;

    const pedido = await prisma.pedidoOmie.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        statusEntrega: true,
        fornecedorNome: true,
        numeroPedido: true,
        total: true,
        nfNumero: true,
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
        { success: false, error: "Pedido revertido nao pode ser marcado como recebido" },
        { status: 400 }
      );
    }

    const dataReceb = dataRecebimento ? new Date(dataRecebimento) : new Date();

    await prisma.$transaction(async (tx) => {
      // 1. Atualiza o pedido com NF e status de entrega
      await tx.pedidoOmie.update({
        where: { id },
        data: {
          nfNumero,
          nfSerie: nfSerie || null,
          nfChave: nfChave || null,
          statusEntrega: "RECEBIDO",
          dataEntregaReal: dataReceb,
          recebidoPorId: user.id,
          recebidoEm: dataReceb,
        },
      });

      // 2. Audit log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "RECEBER_PEDIDO",
          entity: "PedidoOmie",
          entityId: id,
          diff: {
            pedidoNumero: pedido.numeroPedido,
            fornecedor: pedido.fornecedorNome,
            total: pedido.total,
            nfNumero,
            nfSerie,
            dataRecebimento: dataReceb.toISOString(),
            observacao,
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

// DELETE /api/pedido-omie/[id]/receber
// Desfaz o recebimento (volta pro status anterior)
export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);
    const { id } = await params;

    const pedido = await prisma.pedidoOmie.findUnique({
      where: { id },
      select: { id: true, statusEntrega: true, nfNumero: true, numeroPedido: true, fornecedorNome: true },
    });

    if (!pedido) {
      return NextResponse.json(
        { success: false, error: "Pedido nao encontrado" },
        { status: 404 }
      );
    }

    if (pedido.statusEntrega !== "RECEBIDO") {
      return NextResponse.json(
        { success: false, error: "Pedido nao esta marcado como recebido" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.pedidoOmie.update({
        where: { id },
        data: {
          nfNumero: null,
          nfSerie: null,
          nfChave: null,
          statusEntrega: null,
          dataEntregaReal: null,
          recebidoPorId: null,
          recebidoEm: null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DESFAZER_RECEBIMENTO",
          entity: "PedidoOmie",
          entityId: id,
          diff: {
            pedidoNumero: pedido.numeroPedido,
            fornecedor: pedido.fornecedorNome,
            nfAnterior: pedido.nfNumero,
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
