import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    select: { opId: true, opNumero: true },
  });

  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma nao encontrado" }, { status: 404 });
  }

  if (!cronograma.opId) {
    return NextResponse.json({ success: true, data: [], pesoTotais: null, opVinculada: false });
  }

  const rmItens = await prisma.rMItem.findMany({
    where: {
      status: { not: "CANCELADO" },
      rm: {
        status: { not: "CANCELADA" },
        opId: cronograma.opId,
      },
    },
    select: {
      id: true,
      descricao: true,
      material: true,
      qtd: true,
      unidade: true,
      peso: true,
      status: true,
      pedidoOmieId: true,
      pedidoOmie: {
        select: {
          id: true,
          numeroPedido: true,
          status: true,
          prazoEntregaPrevisto: true,
          dataEntregaReal: true,
          statusEntrega: true,
          fornecedorNome: true,
        },
      },
      rm: {
        select: {
          id: true,
          numero: true,
        },
      },
      cotacaoItens: {
        where: { vencedor: true },
        select: {
          precoUnit: true,
          qtdCotada: true,
          prazoEntrega: true,
          cotacao: {
            select: {
              fornecedorNome: true,
              fornecedor: { select: { razaoSocial: true } },
              pedidosOmie: {
                select: {
                  id: true,
                  numeroPedido: true,
                  prazoEntregaPrevisto: true,
                  dataEntregaReal: true,
                  statusEntrega: true,
                  fornecedorNome: true,
                },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
        take: 1,
      },
      recebimentos: {
        select: {
          qtdRecebida: true,
          dataRecebimento: true,
          nfNumero: true,
        },
        orderBy: { dataRecebimento: "desc" },
      },
    },
    orderBy: [{ rm: { numero: "asc" } }, { descricao: "asc" }],
  });

  const data = rmItens.map((item) => {
    const qtdEfetiva = item.peso > 0 ? Number(item.peso) : item.qtd;
    const cot = item.cotacaoItens?.[0] || null;
    const pedidoViaCot = cot?.cotacao?.pedidosOmie?.[0] || null;
    const pedido = pedidoViaCot || item.pedidoOmie || null;
    const fornecedor = cot?.cotacao?.fornecedor?.razaoSocial
      || pedido?.fornecedorNome
      || cot?.cotacao?.fornecedorNome
      || null;

    const qtdRecebida = (item.recebimentos || []).reduce((s, r) => s + r.qtdRecebida, 0);
    const recebidoLegacy = !!pedido?.dataEntregaReal && qtdRecebida === 0;
    const qtdRecebidaFinal = recebidoLegacy ? qtdEfetiva : qtdRecebida;
    const nfs = [...new Set((item.recebimentos || []).map(r => r.nfNumero).filter(Boolean))];

    return {
      id: item.id,
      rmNumero: item.rm.numero,
      descricao: item.descricao,
      unidade: item.peso > 0 ? "KG" : (item.unidade || "UN"),
      status: item.status,
      qtdSolicitada: qtdEfetiva,
      qtdPedida: pedido ? qtdEfetiva : 0,
      qtdRecebida: qtdRecebidaFinal,
      fornecedor,
      numeroPedido: pedido?.numeroPedido || null,
      prazoEntrega: cot?.prazoEntrega || pedido?.prazoEntregaPrevisto || null,
      statusEntrega: pedido?.statusEntrega || null,
      nfs,
      recebido: qtdRecebidaFinal >= qtdEfetiva,
      precoUnit: cot?.precoUnit || 0,
    };
  });

  const solicitado = data.reduce((s, d) => s + d.qtdSolicitada, 0);
  const pedido = data.reduce((s, d) => s + d.qtdPedida, 0);
  const recebido = data.reduce((s, d) => s + d.qtdRecebida, 0);

  return NextResponse.json({
    success: true,
    opVinculada: true,
    data,
    pesoTotais: { solicitado, pedido, recebido, aComprar: solicitado - pedido, aReceber: pedido - recebido },
    totalItens: data.length,
    totalComPedido: data.filter(d => d.qtdPedida > 0).length,
    totalRecebido: data.filter(d => d.recebido).length,
  });
}
