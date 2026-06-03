import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 15;

// GET /api/op/[id]/controle-financeiro
// Retorna resumo financeiro da OP: pedidos Omie + itens atendidos por estoque.
// O custo de estoque e INFORMATIVO — nao subtrai do contrato/FD.
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMPRAS", "COMERCIAL"]);
    const { id } = await params;

    const op = await prisma.oP.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        valorTotalContrato: true,
        rms: {
          select: {
            id: true,
            numero: true,
            itens: {
              where: { status: "ATENDIDO_ESTOQUE" },
              select: {
                id: true,
                descricao: true,
                unidade: true,
                qtd: true,
                peso: true,
                material: true,
                codigo: true,
                atendidoEstoqueQtd: true,
                atendidoEstoquePreco: true,
                atendidoEstoqueTotal: true,
                atendidoEstoqueEm: true,
                atendidoEstoqueObs: true,
                rm: { select: { numero: true } },
              },
            },
          },
        },
      },
    });

    if (!op) {
      return NextResponse.json({ error: "OP nao encontrada" }, { status: 404 });
    }

    // Busca TODOS os pedidos vinculados a esta OP:
    // - via opId direto (FD avulsos)
    // - via cotacao de uma RM desta OP
    const rmIds = op.rms.map((r) => r.id);
    const allPedidos = await prisma.pedidoOmie.findMany({
      where: {
        OR: [
          { opId: id },
          ...(rmIds.length > 0 ? [{ cotacao: { rmId: { in: rmIds } } }] : []),
        ],
        status: { not: "REVERTIDO" },
      },
      select: {
        id: true,
        fornecedorNome: true,
        numeroPedido: true,
        total: true,
        status: true,
        statusEntrega: true,
        nfNumero: true,
        createdAt: true,
        faturamentoDireto: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Itens atendidos por estoque (flatten de todas as RMs)
    const itensEstoque = op.rms.flatMap((rm) =>
      rm.itens.map((it) => ({
        id: it.id,
        rmNumero: it.rm.numero,
        descricao: it.descricao,
        material: it.material,
        codigo: it.codigo,
        unidade: it.peso > 0 ? "KG" : it.unidade,
        quantidade: it.atendidoEstoqueQtd || (it.peso > 0 ? it.peso : it.qtd),
        precoUnit: it.atendidoEstoquePreco || 0,
        total: it.atendidoEstoqueTotal || 0,
        data: it.atendidoEstoqueEm,
        obs: it.atendidoEstoqueObs,
      }))
    );

    // Totais
    const totalEstoque = itensEstoque.reduce((s, i) => s + (i.total || 0), 0);
    const pedidosTorg = allPedidos.filter((p) => !p.faturamentoDireto);
    const pedidosFD = allPedidos.filter((p) => p.faturamentoDireto);
    const totalPedidosTorg = pedidosTorg.reduce((s, p) => s + (p.total || 0), 0);
    const totalPedidosFD = pedidosFD.reduce((s, p) => s + (p.total || 0), 0);
    const totalPedidos = totalPedidosTorg + totalPedidosFD;

    return NextResponse.json({
      success: true,
      data: {
        valorContrato: op.valorTotalContrato || 0,
        pedidos: {
          torg: { lista: pedidosTorg, total: totalPedidosTorg },
          fd: { lista: pedidosFD, total: totalPedidosFD },
          total: totalPedidos,
        },
        estoque: {
          itens: itensEstoque,
          total: totalEstoque,
        },
        custoTotal: totalPedidos + totalEstoque,
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
