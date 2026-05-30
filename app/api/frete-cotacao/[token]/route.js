import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ── GET ── Carregar dados da cotacao de frete (publico, sem auth)
export async function GET(req, { params }) {
  try {
    const { token } = await params;
    const cotacao = await prisma.freteCotacao.findUnique({
      where: { token },
      include: {
        estudo: {
          select: {
            orcamento: { select: { numero: true, cliente: true, obra: true } },
            itensFretes: { orderBy: { ordem: "asc" }, select: {
              descricao: true, origem: true, destino: true,
              distanciaKm: true, pesoTon: true, tipoVeiculo: true,
            }},
          },
        },
      },
    });

    if (!cotacao) {
      return NextResponse.json({ success: false, error: "Cotacao nao encontrada" }, { status: 404 });
    }

    // Nao expor dados internos
    return NextResponse.json({
      success: true,
      data: {
        fornecedorNome: cotacao.fornecedorNome,
        status: cotacao.status,
        valorCotado: cotacao.valorCotado,
        prazoEntrega: cotacao.prazoEntrega,
        observacao: cotacao.observacao,
        anexoUrl: cotacao.anexoUrl,
        anexoNome: cotacao.anexoNome,
        respondidoEm: cotacao.respondidoEm,
        ref: `EPC-${cotacao.estudo?.orcamento?.numero || "???"}`,
        cliente: cotacao.estudo?.orcamento?.cliente || "—",
        obra: cotacao.estudo?.orcamento?.obra || "—",
        itens: cotacao.estudo?.itensFretes || [],
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// ── POST ── Transportadora submete cotacao (publico, sem auth)
const submitSchema = z.object({
  valorCotado: z.number().min(0, "Valor deve ser positivo"),
  prazoEntrega: z.string().min(1, "Prazo obrigatorio"),
  observacao: z.string().optional(),
});

export async function POST(req, { params }) {
  try {
    const { token } = await params;
    const cotacao = await prisma.freteCotacao.findUnique({ where: { token } });

    if (!cotacao) {
      return NextResponse.json({ success: false, error: "Cotacao nao encontrada" }, { status: 404 });
    }

    if (cotacao.status === "SELECIONADA") {
      return NextResponse.json({ success: false, error: "Cotacao ja foi selecionada e nao pode ser alterada" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = submitSchema.parse(body);

    const atualizada = await prisma.freteCotacao.update({
      where: { token },
      data: {
        valorCotado: parsed.valorCotado,
        prazoEntrega: parsed.prazoEntrega,
        observacao: parsed.observacao || cotacao.observacao,
        status: "RECEBIDA",
        respondidoEm: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "RESPONDER_COTACAO_FRETE",
        entity: "FreteCotacao",
        entityId: cotacao.id,
        diff: {
          fornecedor: cotacao.fornecedorNome,
          valorCotado: parsed.valorCotado,
          prazoEntrega: parsed.prazoEntrega,
        },
      },
    });

    return NextResponse.json({ success: true, data: { status: atualizada.status } });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
