import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { consultarPedidoCompra } from "@/lib/omie-recebimento";

// POST — Sincroniza itens de um pedido do Omie pro banco local.
// Usado quando alguem edita o pedido direto no Omie (adiciona/remove itens).
export async function POST(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
    const body = await req.json();
    const { pedidoId } = body;

    if (!pedidoId) {
      return NextResponse.json({ success: false, error: "pedidoId obrigatório" }, { status: 400 });
    }

    const pedido = await prisma.pedidoOmie.findUnique({
      where: { id: pedidoId },
      select: { id: true, codigoPedido: true, numeroPedido: true },
    });

    if (!pedido) {
      return NextResponse.json({ success: false, error: "Pedido não encontrado" }, { status: 404 });
    }
    if (!pedido.codigoPedido) {
      return NextResponse.json({ success: false, error: "Pedido sem código Omie" }, { status: 400 });
    }

    // Consulta pedido no Omie
    const omie = await consultarPedidoCompra(pedido.codigoPedido);
    const itensRaw = omie.produtos_consulta || omie.det || [];

    const itensOmie = itensRaw.map((item) => {
      const prod = item.produto || item;
      return {
        descricao: prod.cDescricao || prod.cProduto || "",
        qtd: Number(prod.nQtde) || 0,
        unidade: prod.cUnidade || "KG",
        valorUnit: Number(prod.nValUnit) || 0,
        qtdRecebida: Number(prod.nQtdeRec) || 0,
      };
    });

    await prisma.pedidoOmie.update({
      where: { id: pedidoId },
      data: { itensOmie },
    });

    return NextResponse.json({
      success: true,
      itens: itensOmie.length,
      mensagem: `${itensOmie.length} item(ns) sincronizado(s) do Omie`,
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
