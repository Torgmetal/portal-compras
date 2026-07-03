import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 15;

// GET /api/op/[id]/materiais
// Retorna todos os itens de todas as RMs da OP com status derivado
// e resumo de contadores por categoria de status.
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMPRAS", "COMERCIAL"]);
    const { id } = await params;

    const op = await prisma.oP.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        cliente: true,
        rms: {
          orderBy: { numero: "asc" },
          select: {
            id: true,
            numero: true,
            itens: {
              orderBy: { ordem: "asc" },
              select: {
                id: true,
                descricao: true,
                unidade: true,
                qtd: true,
                peso: true,
                material: true,
                status: true,
                canceladoEm: true,
                canceladoMotivo: true,
                atendidoEstoqueEm: true,
                atendidoEstoqueQtd: true,
                atendidoEstoquePreco: true,
                atendidoEstoqueTotal: true,
                atendidoEstoqueObs: true,
                pedidoOmie: {
                  select: {
                    id: true,
                    numeroPedido: true,
                    fornecedorNome: true,
                    statusEntrega: true,
                    dataEntregaReal: true,
                    nfNumero: true,
                    nfSerie: true,
                    recebidoEm: true,
                    total: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!op) {
      return NextResponse.json({ error: "OP nao encontrada" }, { status: 404 });
    }

    // Flatten itens de todas as RMs com status derivado
    const itens = [];
    const resumo = {
      RECEBIDO: 0,
      COMPRADO: 0,
      ESTOQUE: 0,
      EM_COTACAO: 0,
      NAO_COMPRADO: 0,
      CANCELADO: 0,
    };

    for (const rm of op.rms) {
      for (const it of rm.itens) {
        const ped = it.pedidoOmie;
        // Recebido = o sync de entregas (syncEntregas) marcou o pedido como
        // entregue. Ele grava `dataEntregaReal` + statusEntrega "ENTREGUE"/
        // "ATRASADO" (NUNCA "RECEBIDO", e não usa `recebidoEm`). A checagem
        // antiga (statusEntrega==="RECEBIDO" || recebidoEm) nunca dava true →
        // todo item ficava "Aguardando entrega" mesmo com o pedido já entregue.
        const pedidoRecebido =
          !!ped?.dataEntregaReal ||
          !!ped?.recebidoEm ||
          ["ENTREGUE", "ATRASADO", "RECEBIDO"].includes(ped?.statusEntrega);
        const pedidoRevertido = ped?.status === "REVERTIDO";

        // Status derivado
        let statusDerivado;
        if (it.status === "CANCELADO") {
          statusDerivado = "CANCELADO";
        } else if (it.status === "ATENDIDO_ESTOQUE") {
          statusDerivado = "ESTOQUE";
        } else if (it.status === "PEDIDO_GERADO" && !pedidoRevertido) {
          statusDerivado = pedidoRecebido ? "RECEBIDO" : "COMPRADO";
        } else if (it.status === "EM_COTACAO" || it.status === "COTADO") {
          statusDerivado = "EM_COTACAO";
        } else {
          statusDerivado = "NAO_COMPRADO";
        }

        resumo[statusDerivado]++;

        itens.push({
          id: it.id,
          rmNumero: rm.numero,
          descricao: it.descricao,
          material: it.material,
          unidade: it.peso > 0 ? "KG" : it.unidade,
          quantidade: it.peso > 0 ? it.peso : it.qtd,
          status: it.status,
          // Dados do pedido
          pedidoRecebido,
          pedidoNumero: ped?.numeroPedido || null,
          fornecedor: ped?.fornecedorNome || null,
          nfNumero: ped?.nfNumero || null,
          recebidoEm: ped?.recebidoEm || ped?.dataEntregaReal || null,
          // Dados de estoque
          estoquePreco: it.atendidoEstoquePreco || null,
          estoqueTotal: it.atendidoEstoqueTotal || null,
          estoqueData: it.atendidoEstoqueEm || null,
          estoqueObs: it.atendidoEstoqueObs || null,
          // Cancelamento
          canceladoEm: it.canceladoEm || null,
          canceladoMotivo: it.canceladoMotivo || null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: { itens, resumo, numero: op.numero, cliente: op.cliente },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
