import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const recebimentoSchema = z.object({
  rmItemId: z.string().min(1, "rmItemId obrigatorio"),
  pedidoOmieId: z.string().optional().nullable(),
  qtdRecebida: z.number().positive("Quantidade deve ser maior que zero"),
  dataRecebimento: z.string().optional(), // ISO date string
  nfNumero: z.string().optional().nullable(),
  nfChave: z.string().optional().nullable(),
  nfSerie: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

// POST — Registra manualmente o recebimento (parcial ou total) de um item
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);

    const body = await req.json();
    const parsed = recebimentoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados invalidos" },
        { status: 400 }
      );
    }

    const { rmItemId, pedidoOmieId, qtdRecebida, dataRecebimento, nfNumero, nfChave, nfSerie, observacao } = parsed.data;

    // Verifica se o RMItem existe e busca info
    const rmItem = await prisma.rMItem.findUnique({
      where: { id: rmItemId },
      select: {
        id: true,
        descricao: true,
        qtd: true,
        peso: true,
        unidade: true,
        pedidoOmieId: true,
        rm: { select: { numero: true } },
      },
    });

    if (!rmItem) {
      return NextResponse.json(
        { success: false, error: "Item nao encontrado" },
        { status: 404 }
      );
    }

    // Qtd efetiva sempre em KG — peso tem prioridade; fallback pra qtd
    const qtdEfetiva = rmItem.peso > 0 ? Number(rmItem.peso) : rmItem.qtd;
    const unidade = "KG";

    // Calcula total ja recebido desse item
    const recebimentosExistentes = await prisma.recebimento.aggregate({
      where: { rmItemId },
      _sum: { qtdRecebida: true },
    });
    const totalJaRecebido = recebimentosExistentes._sum.qtdRecebida || 0;
    const novoTotal = totalJaRecebido + qtdRecebida;

    if (novoTotal > qtdEfetiva * 1.1) {
      // Permite ate 10% a mais (tolerancia de pesagem)
      return NextResponse.json(
        { success: false, error: `Quantidade excede o solicitado. Ja recebido: ${totalJaRecebido} ${unidade}, solicitado: ${qtdEfetiva} ${unidade}` },
        { status: 400 }
      );
    }

    // Cria o recebimento
    const recebimento = await prisma.recebimento.create({
      data: {
        rmItemId,
        pedidoOmieId: pedidoOmieId || rmItem.pedidoOmieId || null,
        qtdRecebida,
        unidade,
        dataRecebimento: dataRecebimento ? new Date(dataRecebimento) : new Date(),
        nfNumero: nfNumero || null,
        nfChave: nfChave || null,
        nfSerie: nfSerie || null,
        origem: "MANUAL",
        observacao: observacao || null,
        createdById: user.id,
      },
    });

    // Se o item atingiu 100% de recebimento, marca pedidoOmie como entregue
    const pedidoId = pedidoOmieId || rmItem.pedidoOmieId;
    if (pedidoId && novoTotal >= qtdEfetiva) {
      // Verifica se TODOS os itens do pedido foram recebidos
      const itensDoPedido = await prisma.rMItem.findMany({
        where: { pedidoOmieId: pedidoId },
        select: {
          id: true,
          qtd: true,
          peso: true,
          recebimentos: { select: { qtdRecebida: true } },
        },
      });

      const todoRecebido = itensDoPedido.every((item) => {
        const qtdItem = item.peso > 0 ? Number(item.peso) : item.qtd;
        const recItem = item.recebimentos.reduce((s, r) => s + r.qtdRecebida, 0);
        return recItem >= qtdItem;
      });

      if (todoRecebido) {
        await prisma.pedidoOmie.update({
          where: { id: pedidoId },
          data: {
            dataEntregaReal: new Date(),
            statusEntrega: "ENTREGUE",
          },
        });
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "REGISTRAR_RECEBIMENTO",
        entity: "Recebimento",
        entityId: recebimento.id,
        diff: {
          rmItemId,
          rmNumero: rmItem.rm.numero,
          descricao: rmItem.descricao,
          qtdRecebida,
          nfNumero,
          totalRecebido: novoTotal,
          qtdSolicitada: qtdEfetiva,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: recebimento.id,
        qtdRecebida,
        totalRecebido: novoTotal,
        qtdSolicitada: qtdEfetiva,
        completo: novoTotal >= qtdEfetiva,
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// GET — Lista recebimentos de um item especifico
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);

    const { searchParams } = new URL(req.url);
    const rmItemId = searchParams.get("rmItemId");
    const pedidoOmieId = searchParams.get("pedidoOmieId");

    if (!rmItemId && !pedidoOmieId) {
      return NextResponse.json(
        { success: false, error: "rmItemId ou pedidoOmieId obrigatorio" },
        { status: 400 }
      );
    }

    const where = {};
    if (rmItemId) where.rmItemId = rmItemId;
    if (pedidoOmieId) where.pedidoOmieId = pedidoOmieId;

    const recebimentos = await prisma.recebimento.findMany({
      where,
      orderBy: { dataRecebimento: "desc" },
      select: {
        id: true,
        qtdRecebida: true,
        unidade: true,
        dataRecebimento: true,
        nfNumero: true,
        nfChave: true,
        origem: true,
        observacao: true,
        createdBy: { select: { name: true } },
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: recebimentos });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
