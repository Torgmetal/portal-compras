import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const itemSchema = z.object({
  cotacaoItemId: z.string().min(1),
  precoUnit: z.number().min(0),
  qtdCotada: z.number().min(0),
  observacao: z.string().optional().nullable(),
});

const schema = z.object({
  itens: z.array(itemSchema).min(1),
  prazoEntrega: z.string().optional().nullable(),
  condicaoPagamento: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

export async function POST(req, { params }) {
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { token: params.token },
    include: { itens: { select: { id: true } } },
  });
  if (!cotacao) return NextResponse.json({ error: "Token inválido." }, { status: 404 });
  if (cotacao.status === "RECEBIDA") {
    return NextResponse.json({ error: "Proposta já foi enviada." }, { status: 409 });
  }
  if (cotacao.status === "CANCELADA") {
    return NextResponse.json({ error: "Cotação cancelada." }, { status: 409 });
  }

  // Filtra apenas itens válidos da própria cotação
  const idsValidos = new Set(cotacao.itens.map((i) => i.id));
  const itensValidos = body.itens.filter((it) => idsValidos.has(it.cotacaoItemId) && it.precoUnit > 0);
  if (itensValidos.length === 0) {
    return NextResponse.json({ error: "Preencha ao menos um preço unitário." }, { status: 400 });
  }

  const total = itensValidos.reduce((s, it) => s + it.precoUnit * it.qtdCotada, 0);

  await prisma.$transaction(async (tx) => {
    for (const it of itensValidos) {
      await tx.cotacaoItem.update({
        where: { id: it.cotacaoItemId },
        data: {
          precoUnit: it.precoUnit,
          qtdCotada: it.qtdCotada,
          observacao: it.observacao || null,
        },
      });
    }

    // Combina observações em um único campo
    const obsParts = [];
    if (body.prazoEntrega) obsParts.push(`Prazo de entrega: ${body.prazoEntrega}`);
    if (body.condicaoPagamento) obsParts.push(`Pagamento: ${body.condicaoPagamento}`);
    if (body.observacao) obsParts.push(body.observacao);
    const obsCombinada = obsParts.join(" | ") || null;

    await tx.cotacao.update({
      where: { id: cotacao.id },
      data: {
        status: "RECEBIDA",
        recebidaEm: new Date(),
        total,
        prazoPagamento: body.condicaoPagamento || null,
        observacao: obsCombinada,
      },
    });

    // Atualiza RMItens dessa cotação pra status COTADO (se ainda EM_COTACAO)
    const rmItemIds = await tx.cotacaoItem.findMany({
      where: { cotacaoId: cotacao.id },
      select: { rmItemId: true },
    });
    await tx.rMItem.updateMany({
      where: {
        id: { in: rmItemIds.map((c) => c.rmItemId) },
        status: "EM_COTACAO",
      },
      data: { status: "COTADO" },
    });

    // Atualiza status da RM se ainda EM_COTACAO
    await tx.rM.updateMany({
      where: { id: cotacao.rmId, status: "EM_COTACAO" },
      data: { status: "COTADA" },
    });

    await tx.auditLog.create({
      data: {
        userId: null,
        action: "submeter_cotacao_fornecedor",
        entity: "Cotacao",
        entityId: cotacao.id,
        diff: { total, fornecedor: cotacao.fornecedorNome, itens: itensValidos.length },
      },
    });
  });

  return NextResponse.json({ ok: true, total });
}
