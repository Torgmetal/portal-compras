import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET — Lista itens vencedores com prazo de entrega pra montar o cronograma.
// Agrega dados de CotacaoItem (vencedor=true) + Cotacao + RM + OP + PedidoOmie.
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);

    const { searchParams } = new URL(req.url);
    const opId = searchParams.get("opId"); // filtro opcional por OP

    // Busca CotacaoItem vencedores que JÁ TÊM pedido de compra gerado no Omie.
    // Itens sem pedido (ex: Hard, estoque interno) não entram no acompanhamento.
    const where = {
      vencedor: true,
      cotacao: {
        status: { not: "CANCELADA" },
        pedidosOmie: { some: {} },
      },
    };

    // Se filtro por OP, limita aos rmItems que pertencem a RMs dessa OP
    if (opId) {
      where.rmItem = { rm: { opId } };
    }

    const itens = await prisma.cotacaoItem.findMany({
      where,
      select: {
        id: true,
        precoUnit: true,
        qtdCotada: true,
        icmsPct: true,
        ipiPct: true,
        prazoEntrega: true,
        vencedor: true,
        cotacao: {
          select: {
            id: true,
            fornecedorNome: true,
            fornecedorEmail: true,
            fornecedor: {
              select: { razaoSocial: true },
            },
            status: true,
            pedidosOmie: {
              select: {
                id: true,
                numeroPedido: true,
                codigoPedido: true,
                status: true,
                prazoEntregaPrevisto: true,
                dataEntregaReal: true,
                statusEntrega: true,
                fornecedorNome: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
        rmItem: {
          select: {
            id: true,
            descricao: true,
            material: true,
            qtd: true,
            unidade: true,
            peso: true,
            status: true,
            rm: {
              select: {
                id: true,
                numero: true,
                opId: true,
                op: {
                  select: {
                    id: true,
                    numero: true,
                    cliente: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { prazoEntrega: "asc" },
        { cotacao: { fornecedorNome: "asc" } },
      ],
    });

    // Classifica cada item em um status de entrega
    const agora = new Date();
    const em7dias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

    const mapped = itens.map((item) => {
      const pedido = item.cotacao?.pedidosOmie?.[0] || null;
      const prazo = item.prazoEntrega ? new Date(item.prazoEntrega) : null;

      // Status de entrega
      let statusEntrega = "SEM_PRAZO";
      if (pedido?.dataEntregaReal) {
        statusEntrega = "ENTREGUE";
      } else if (prazo) {
        if (prazo < agora) {
          statusEntrega = "ATRASADO";
        } else if (prazo <= em7dias) {
          statusEntrega = "PROXIMO";
        } else {
          statusEntrega = "NO_PRAZO";
        }
      }

      // Valor bruto da linha
      const valorBruto = (item.precoUnit || 0) * (item.qtdCotada || 0);

      // Prioridade: 1) cadastro unificado, 2) pedido Omie, 3) texto da cotacao
      const fornecedor = item.cotacao.fornecedor?.razaoSocial
        || pedido?.fornecedorNome
        || item.cotacao.fornecedorNome;

      return {
        id: item.id,
        descricao: item.rmItem.descricao,
        material: item.rmItem.material,
        qtd: item.rmItem.peso > 0 ? Number(item.rmItem.peso) : item.rmItem.qtd,
        unidade: item.rmItem.peso > 0 ? "KG" : item.rmItem.unidade,
        precoUnit: item.precoUnit,
        valorBruto,
        prazoEntrega: item.prazoEntrega,
        statusEntrega,
        fornecedor,
        cotacaoId: item.cotacao.id,
        rmItemId: item.rmItem.id,
        rmItemStatus: item.rmItem.status,
        rmId: item.rmItem.rm.id,
        rmNumero: item.rmItem.rm.numero,
        opId: item.rmItem.rm.op.id,
        opNumero: item.rmItem.rm.op.numero,
        opCliente: item.rmItem.rm.op.cliente,
        pedido: pedido ? {
          id: pedido.id,
          numero: pedido.numeroPedido || pedido.codigoPedido,
          status: pedido.status,
          prazoEntregaPrevisto: pedido.prazoEntregaPrevisto,
          dataEntregaReal: pedido.dataEntregaReal,
          statusEntrega: pedido.statusEntrega,
        } : null,
      };
    });

    // Deduplica por rmItemId — se o mesmo item aparece em mais de uma cotacao
    // vencedora, mantém apenas o que tem pedido (ou o primeiro)
    const vistos = new Map();
    for (const item of mapped) {
      const key = item.rmItemId;
      if (!vistos.has(key) || (item.pedido && !vistos.get(key).pedido)) {
        vistos.set(key, item);
      }
    }
    const data = Array.from(vistos.values());

    return NextResponse.json({ success: true, data });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// PATCH — Marcar item como entregue (registra dataEntregaReal no PedidoOmie)
export async function PATCH(req) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);
    const body = await req.json();
    const { cotacaoItemId, dataEntregaReal } = body;

    if (!cotacaoItemId) {
      return NextResponse.json({ success: false, error: "cotacaoItemId obrigatorio" }, { status: 400 });
    }

    // Busca o CotacaoItem pra saber o pedido vinculado
    const cotItem = await prisma.cotacaoItem.findUnique({
      where: { id: cotacaoItemId },
      select: {
        id: true,
        prazoEntrega: true,
        cotacao: {
          select: {
            pedidosOmie: { select: { id: true }, take: 1 },
          },
        },
      },
    });

    if (!cotItem) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    const pedido = cotItem.cotacao?.pedidosOmie?.[0];
    if (pedido) {
      const dataReal = dataEntregaReal ? new Date(dataEntregaReal) : new Date();
      const prazo = cotItem.prazoEntrega;
      const atrasado = prazo && dataReal > new Date(prazo);

      await prisma.pedidoOmie.update({
        where: { id: pedido.id },
        data: {
          dataEntregaReal: dataReal,
          statusEntrega: atrasado ? "ATRASADO" : "ENTREGUE",
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "REGISTRAR_ENTREGA",
        entity: "CotacaoItem",
        entityId: cotacaoItemId,
        diff: { dataEntregaReal: dataEntregaReal || new Date().toISOString() },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
