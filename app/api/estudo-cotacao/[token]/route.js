import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ── GET ── Carregar dados da cotacao (publico, sem auth)
export async function GET(req, { params }) {
  try {
    const { token } = await params;
    const cotacao = await prisma.estudoCotacao.findUnique({
      where: { token },
      include: {
        itens: { orderBy: { ordem: "asc" } },
        estudo: {
          select: {
            orcamento: { select: { numero: true } },
          },
        },
      },
    });

    if (!cotacao) {
      return NextResponse.json({ success: false, error: "Cotacao nao encontrada" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        fornecedorNome: cotacao.fornecedorNome,
        tipo: cotacao.tipo,
        status: cotacao.status,
        prazoEntrega: cotacao.prazoEntrega,
        condicaoPgto: cotacao.condicaoPgto,
        observacao: cotacao.observacao,
        respondidoEm: cotacao.respondidoEm,
        ref: `EPC-${cotacao.estudo?.orcamento?.numero || "???"}`,
        itens: cotacao.itens.map((item) => ({
          id: item.id,
          descricao: item.descricao,
          especificacao: item.especificacao,
          unidade: item.unidade,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitario,
          observacao: item.observacao,
        })),
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// ── POST ── Fornecedor submete cotacao com precos (publico, sem auth)
const submitSchema = z.object({
  prazoEntrega: z.string().min(1, "Prazo obrigatorio"),
  condicaoPgto: z.string().optional(),
  observacao: z.string().optional(),
  itens: z.array(z.object({
    id: z.string(),
    precoUnitario: z.number().min(0, "Preco deve ser positivo").nullable(),
    observacao: z.string().optional(),
  })).min(1, "Informe os precos"),
});

export async function POST(req, { params }) {
  try {
    const { token } = await params;
    const cotacao = await prisma.estudoCotacao.findUnique({
      where: { token },
      include: { itens: true },
    });

    if (!cotacao) {
      return NextResponse.json({ success: false, error: "Cotacao nao encontrada" }, { status: 404 });
    }

    if (cotacao.status === "SELECIONADA") {
      return NextResponse.json({ success: false, error: "Cotacao ja foi selecionada e nao pode ser alterada" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = submitSchema.parse(body);

    // Validar que os IDs pertencem a esta cotacao
    const idsValidos = new Set(cotacao.itens.map((i) => i.id));
    for (const item of parsed.itens) {
      if (!idsValidos.has(item.id)) {
        return NextResponse.json({ success: false, error: `Item ${item.id} nao pertence a esta cotacao` }, { status: 400 });
      }
    }

    // Atualizar precos de cada item
    for (const item of parsed.itens) {
      await prisma.estudoCotacaoItem.update({
        where: { id: item.id },
        data: {
          precoUnitario: item.precoUnitario,
          observacao: item.observacao || undefined,
        },
      });
    }

    // Atualizar cotacao
    await prisma.estudoCotacao.update({
      where: { token },
      data: {
        prazoEntrega: parsed.prazoEntrega,
        condicaoPgto: parsed.condicaoPgto || undefined,
        observacao: parsed.observacao || cotacao.observacao,
        status: "RECEBIDA",
        respondidoEm: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "RESPONDER_COTACAO_ESTUDO",
        entity: "EstudoCotacao",
        entityId: cotacao.id,
        diff: {
          fornecedor: cotacao.fornecedorNome,
          tipo: cotacao.tipo,
          itensPreenchidos: parsed.itens.filter((i) => i.precoUnitario != null).length,
          prazoEntrega: parsed.prazoEntrega,
        },
      },
    });

    return NextResponse.json({ success: true, data: { status: "RECEBIDA" } });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
