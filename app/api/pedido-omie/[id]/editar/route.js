import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  total: z.number().min(0, "Valor deve ser >= 0").optional(),
  fornecedorNome: z.string().min(1, "Nome do fornecedor obrigatorio").optional(),
  numeroPedido: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

// PATCH /api/pedido-omie/[id]/editar
// Edita campos do pedido de compra no portal (quando o pedido foi ajustado no Omie).
export async function PATCH(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);
    const { id } = await params;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados invalidos" },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoOmie.findUnique({
      where: { id },
      select: { id: true, status: true, total: true, fornecedorNome: true, numeroPedido: true, observacao: true },
    });

    if (!pedido) {
      return NextResponse.json({ error: "Pedido nao encontrado" }, { status: 404 });
    }

    if (pedido.status === "REVERTIDO") {
      return NextResponse.json({ error: "Nao e possivel editar um pedido revertido" }, { status: 400 });
    }

    // Monta o update apenas com campos enviados
    const data = {};
    const antes = {};
    const depois = {};

    if (parsed.data.total !== undefined && parsed.data.total !== pedido.total) {
      antes.total = pedido.total;
      depois.total = parsed.data.total;
      data.total = parsed.data.total;
    }
    if (parsed.data.fornecedorNome !== undefined && parsed.data.fornecedorNome !== pedido.fornecedorNome) {
      antes.fornecedorNome = pedido.fornecedorNome;
      depois.fornecedorNome = parsed.data.fornecedorNome;
      data.fornecedorNome = parsed.data.fornecedorNome;
    }
    if (parsed.data.numeroPedido !== undefined && parsed.data.numeroPedido !== pedido.numeroPedido) {
      antes.numeroPedido = pedido.numeroPedido;
      depois.numeroPedido = parsed.data.numeroPedido;
      data.numeroPedido = parsed.data.numeroPedido;
    }
    if (parsed.data.observacao !== undefined && parsed.data.observacao !== pedido.observacao) {
      antes.observacao = pedido.observacao;
      depois.observacao = parsed.data.observacao;
      data.observacao = parsed.data.observacao;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: true, msg: "Nenhuma alteracao" });
    }

    await prisma.$transaction([
      prisma.pedidoOmie.update({ where: { id }, data }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "editar_pedido_omie",
          entity: "PedidoOmie",
          entityId: id,
          diff: { antes, depois },
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
