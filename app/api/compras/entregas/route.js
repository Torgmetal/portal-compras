import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET — Lista pedidos de compra com status de entrega.
// Retorna dados agrupados por PedidoOmie (não por item individual).
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);

    const pedidos = await prisma.pedidoOmie.findMany({
      where: {
        status: { not: "ERRO" },
      },
      select: {
        id: true,
        numeroPedido: true,
        codigoPedido: true,
        fornecedorNome: true,
        total: true,
        status: true,
        faturamentoDireto: true,
        criadoManualmente: true,
        prazoEntregaPrevisto: true,
        prazoOriginal: true,
        dataEntregaReal: true,
        statusEntrega: true,
        createdAt: true,
        observacao: true,
        opId: true,
        op: {
          select: { id: true, numero: true, cliente: true, obra: true },
        },
        cotacaoId: true,
        cotacao: {
          select: {
            id: true,
            fornecedorNome: true,
            fornecedorEmail: true,
            fornecedor: { select: { razaoSocial: true, email: true } },
            rm: {
              select: {
                id: true, numero: true, tipoRM: true,
                opId: true,
                op: { select: { id: true, numero: true, cliente: true, obra: true } },
              },
            },
            itens: {
              where: { vencedor: true },
              select: {
                id: true,
                precoUnit: true,
                qtdCotada: true,
                prazoEntrega: true,
                rmItem: {
                  select: {
                    descricao: true,
                    material: true,
                    qtd: true,
                    unidade: true,
                    peso: true,
                  },
                },
              },
            },
          },
        },
        // RM atendida (FD avulsos) — precisa do tipoRM pra separar consumíveis
        rmAtendida: {
          select: { id: true, numero: true, tipoRM: true },
        },
        // Itens de RM vinculados diretamente ao pedido (FD avulsos)
        rmItens: {
          select: {
            id: true,
            descricao: true,
            material: true,
            qtd: true,
            unidade: true,
            peso: true,
          },
          take: 20,
        },
        // Recebimentos parciais
        recebimentos: {
          select: {
            id: true,
            qtdRecebida: true,
            dataRecebimento: true,
            nfNumero: true,
          },
          orderBy: { dataRecebimento: "desc" },
        },
        // Historico de postergacoes de prazo
        prazoHistorico: {
          select: {
            id: true,
            prazoAnterior: true,
            prazoNovo: true,
            motivo: true,
            criadoEm: true,
            alteradoPor: { select: { name: true } },
          },
          orderBy: { criadoEm: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const agora = new Date();
    const em7dias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

    const data = pedidos.map((p) => {
      // Itens do pedido — vem da cotação (vencedores) ou dos rmItens diretos
      const itensCotacao = p.cotacao?.itens?.map((ci) => ({
        descricao: ci.rmItem?.descricao || "—",
        material: ci.rmItem?.material,
        qtd: ci.rmItem?.peso > 0 ? Number(ci.rmItem.peso) : ci.rmItem?.qtd,
        unidade: ci.rmItem?.peso > 0 ? "KG" : ci.rmItem?.unidade,
        precoUnit: ci.precoUnit,
        prazoEntrega: ci.prazoEntrega,
      })) || [];

      const itensDiretos = p.rmItens?.map((ri) => ({
        descricao: ri.descricao || "—",
        material: ri.material,
        qtd: ri.peso > 0 ? Number(ri.peso) : ri.qtd,
        unidade: ri.peso > 0 ? "KG" : ri.unidade,
        precoUnit: null,
        prazoEntrega: null,
      })) || [];

      const itens = itensCotacao.length > 0 ? itensCotacao : itensDiretos;

      // Prazo: usa PedidoOmie.prazoEntregaPrevisto; se null, calcula
      // o prazo mais tardio dos CotacaoItems vencedores (fallback)
      let prazoFinal = p.prazoEntregaPrevisto;
      if (!prazoFinal && itensCotacao.length > 0) {
        const prazosItens = itensCotacao
          .filter((ci) => ci.prazoEntrega)
          .map((ci) => new Date(ci.prazoEntrega).getTime());
        if (prazosItens.length > 0) {
          prazoFinal = new Date(Math.max(...prazosItens));
        }
      }

      // Calcular status de entrega baseado no prazo
      const prazo = prazoFinal ? new Date(prazoFinal) : null;
      let statusCalc = "SEM_PRAZO";

      if (p.dataEntregaReal) {
        statusCalc = "ENTREGUE";
      } else if (prazo) {
        if (prazo < agora) {
          statusCalc = "ATRASADO";
        } else if (prazo <= em7dias) {
          statusCalc = "PROXIMO";
        } else {
          statusCalc = "NO_PRAZO";
        }
      }

      // Nome do fornecedor: prioriza cadastro unificado
      const fornecedor = p.cotacao?.fornecedor?.razaoSocial
        || p.fornecedorNome
        || p.cotacao?.fornecedorNome
        || "—";

      // OP: prioriza vínculo direto, fallback pra cotação→RM→OP
      const opDireta = p.op;
      const opViaCotacao = p.cotacao?.rm?.op;
      const op = opDireta || opViaCotacao || null;

      // Tipo de RM: ENGENHARIA ou INTERNA (consumíveis)
      const tipoRM = p.cotacao?.rm?.tipoRM || p.rmAtendida?.tipoRM || "ENGENHARIA";

      // Email do fornecedor (pra cobrança de entrega)
      const fornecedorEmail = p.cotacao?.fornecedor?.email || p.cotacao?.fornecedorEmail || null;

      return {
        id: p.id,
        numero: p.numeroPedido || p.codigoPedido || "s/n",
        codigoPedido: p.codigoPedido || null,
        fornecedor,
        fornecedorEmail,
        total: p.total,
        status: p.status,
        statusEntrega: statusCalc,
        faturamentoDireto: p.faturamentoDireto,
        criadoManualmente: p.criadoManualmente,
        tipoRM,
        prazoEntregaPrevisto: prazoFinal || p.prazoEntregaPrevisto,
        dataEntregaReal: p.dataEntregaReal,
        createdAt: p.createdAt,
        observacao: p.observacao,
        opId: op?.id || null,
        opNumero: op?.numero || null,
        opCliente: op?.cliente || null,
        opObra: op?.obra || null,
        rmId: p.cotacao?.rm?.id || p.rmAtendida?.id || null,
        rmNumero: p.cotacao?.rm?.numero || p.rmAtendida?.numero || null,
        cotacaoId: p.cotacaoId,
        qtdItens: itens.length,
        itens,
        recebimentos: p.recebimentos,
        temRecebimento: p.recebimentos.length > 0,
        prazoOriginal: p.prazoOriginal || null,
        prazoHistorico: p.prazoHistorico || [],
        foiPostergado: (p.prazoHistorico?.length || 0) > 0,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// PATCH — Marcar pedido como entregue
export async function PATCH(req) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);
    const body = await req.json();
    const { pedidoId } = body;

    if (!pedidoId) {
      return NextResponse.json({ success: false, error: "pedidoId obrigatorio" }, { status: 400 });
    }

    const pedido = await prisma.pedidoOmie.findUnique({
      where: { id: pedidoId },
      select: { id: true, prazoEntregaPrevisto: true },
    });

    if (!pedido) {
      return NextResponse.json({ success: false, error: "Pedido nao encontrado" }, { status: 404 });
    }

    const dataReal = new Date();
    const prazo = pedido.prazoEntregaPrevisto;
    const atrasado = prazo && dataReal > new Date(prazo);

    await prisma.pedidoOmie.update({
      where: { id: pedidoId },
      data: {
        dataEntregaReal: dataReal,
        statusEntrega: atrasado ? "ATRASADO" : "ENTREGUE",
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "REGISTRAR_ENTREGA_PEDIDO",
        entity: "PedidoOmie",
        entityId: pedidoId,
        diff: { dataEntregaReal: dataReal.toISOString() },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
