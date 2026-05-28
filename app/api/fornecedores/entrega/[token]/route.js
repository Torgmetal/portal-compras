// GET  /api/fornecedores/entrega/[token] — dados do pedido p/ pagina publica
// PATCH /api/fornecedores/entrega/[token] — fornecedor informa nova data
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ── GET: retorna dados do pedido para a pagina publica ──
export async function GET(_req, { params }) {
  const { token } = params;

  const pedido = await prisma.pedidoOmie.findUnique({
    where: { tokenEntrega: token },
    select: {
      id: true,
      numeroPedido: true,
      codigoPedido: true,
      fornecedorNome: true,
      prazoEntregaPrevisto: true,
      prazoOriginal: true,
      dataEntregaReal: true,
      cotacao: {
        select: {
          fornecedorNome: true,
          fornecedor: { select: { razaoSocial: true } },
          itens: {
            where: { vencedor: true },
            select: {
              id: true,
              prazoEntrega: true,
              rmItem: {
                select: {
                  descricao: true,
                  qtd: true,
                  unidade: true,
                  peso: true,
                  recebimentos: {
                    select: { qtdRecebida: true },
                  },
                },
              },
            },
          },
        },
      },
      rmItens: {
        select: {
          id: true,
          descricao: true,
          qtd: true,
          unidade: true,
          peso: true,
          recebimentos: {
            select: { qtdRecebida: true },
          },
        },
        take: 30,
      },
      prazoHistorico: {
        select: {
          prazoAnterior: true,
          prazoNovo: true,
          motivo: true,
          criadoEm: true,
        },
        orderBy: { criadoEm: "asc" },
      },
    },
  });

  if (!pedido) {
    return NextResponse.json({ error: "Token invalido" }, { status: 404 });
  }

  // Montar itens com saldo pendente
  const itensCotacao = pedido.cotacao?.itens?.map((ci) => {
    const ri = ci.rmItem;
    const qtdOriginal = ri?.peso > 0 ? Number(ri.peso) : (ri?.qtd || 0);
    const unidade = ri?.peso > 0 ? "KG" : (ri?.unidade || "UN");
    const totalRecebido = (ri?.recebimentos || []).reduce((s, r) => s + (r.qtdRecebida || 0), 0);
    const qtdPendente = Math.max(0, qtdOriginal - totalRecebido);
    return { descricao: ri?.descricao || "—", qtdOriginal, unidade, totalRecebido, qtdPendente };
  }) || [];

  const itensDiretos = pedido.rmItens?.map((ri) => {
    const qtdOriginal = ri.peso > 0 ? Number(ri.peso) : (ri.qtd || 0);
    const unidade = ri.peso > 0 ? "KG" : (ri.unidade || "UN");
    const totalRecebido = (ri.recebimentos || []).reduce((s, r) => s + (r.qtdRecebida || 0), 0);
    const qtdPendente = Math.max(0, qtdOriginal - totalRecebido);
    return { descricao: ri.descricao || "—", qtdOriginal, unidade, totalRecebido, qtdPendente };
  }) || [];

  const itens = itensCotacao.length > 0 ? itensCotacao : itensDiretos;
  const itensPendentes = itens.filter((it) => it.qtdPendente > 0);

  const nomeFornecedor =
    pedido.cotacao?.fornecedor?.razaoSocial ||
    pedido.fornecedorNome ||
    pedido.cotacao?.fornecedorNome ||
    "Fornecedor";

  return NextResponse.json({
    success: true,
    numero: pedido.numeroPedido || pedido.codigoPedido || "s/n",
    fornecedor: nomeFornecedor,
    prazoEntregaPrevisto: pedido.prazoEntregaPrevisto,
    prazoOriginal: pedido.prazoOriginal,
    jaEntregue: !!pedido.dataEntregaReal,
    itensPendentes,
    totalItens: itens.length,
    prazoHistorico: pedido.prazoHistorico,
  });
}

// ── PATCH: fornecedor informa nova data ──
const patchSchema = z.object({
  novoPrazo: z.string().min(1, "Data obrigatoria"),
  motivo: z.string().max(500).optional(),
});

export async function PATCH(req, { params }) {
  const { token } = params;

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Dados invalidos: " + (e.issues?.[0]?.message || e.message) },
      { status: 400 }
    );
  }

  const novoPrazo = new Date(body.novoPrazo);
  if (isNaN(novoPrazo.getTime())) {
    return NextResponse.json({ error: "Data invalida" }, { status: 400 });
  }

  const pedido = await prisma.pedidoOmie.findUnique({
    where: { tokenEntrega: token },
    select: {
      id: true,
      prazoEntregaPrevisto: true,
      prazoOriginal: true,
      dataEntregaReal: true,
    },
  });

  if (!pedido) {
    return NextResponse.json({ error: "Token invalido" }, { status: 404 });
  }

  if (pedido.dataEntregaReal) {
    return NextResponse.json(
      { error: "Este pedido ja foi entregue." },
      { status: 400 }
    );
  }

  const prazoAnterior = pedido.prazoEntregaPrevisto;

  await prisma.$transaction(async (tx) => {
    const updateData = { prazoEntregaPrevisto: novoPrazo };
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
        motivo: body.motivo?.trim()
          ? `[Fornecedor] ${body.motivo.trim()}`
          : "[Fornecedor] Previsao informada via portal",
        // alteradoPorId nao preenchido — acao do fornecedor (sem login)
        alteradoPorId: null,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "FORNECEDOR_ATUALIZOU_PRAZO",
        entity: "PedidoOmie",
        entityId: pedido.id,
        diff: {
          prazoAnterior: prazoAnterior?.toISOString() || null,
          prazoNovo: novoPrazo.toISOString(),
          motivo: body.motivo?.trim() || null,
          viaPortalFornecedor: true,
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
