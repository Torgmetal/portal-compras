import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET — Consolida saldo de materiais: solicitado (RMs) vs pedido vs recebido.
// Agrupa por descricao de RMItem e calcula quantidades em cada etapa.
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);

    const { searchParams } = new URL(req.url);
    const opId = searchParams.get("opId");
    const tipoRM = searchParams.get("tipoRM"); // "ENGENHARIA" | "INTERNA" | null (tudo)

    // Busca todos os RMItems ativos (nao cancelados) com suas cotacoes vencedoras e pedidos
    const where = {
      status: { not: "CANCELADO" },
      rm: {
        status: { not: "CANCELADA" },
        ...(opId ? { opId } : {}),
        ...(tipoRM ? { tipoRM } : {}),
      },
    };

    const rmItens = await prisma.rMItem.findMany({
      where,
      select: {
        id: true,
        descricao: true,
        material: true,
        qtd: true,
        unidade: true,
        peso: true,
        status: true,
        pedidoOmieId: true,
        // Pedido direto (quando vinculado no RMItem, nao via cotacao)
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
            opId: true,
            op: { select: { id: true, numero: true, cliente: true } },
          },
        },
        cotacaoItens: {
          where: { vencedor: true },
          select: {
            id: true,
            qtdCotada: true,
            precoUnit: true,
            prazoEntrega: true,
            cotacao: {
              select: {
                id: true,
                fornecedorNome: true,
                fornecedor: { select: { razaoSocial: true } },
                pedidosOmie: {
                  select: {
                    id: true,
                    numeroPedido: true,
                    status: true,
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
          take: 1, // So o vencedor
        },
        // Recebimentos registrados (manual ou sync)
        recebimentos: {
          select: {
            id: true,
            qtdRecebida: true,
            dataRecebimento: true,
            nfNumero: true,
            origem: true,
          },
          orderBy: { dataRecebimento: "desc" },
        },
      },
      orderBy: { descricao: "asc" },
    });

    // Agrupa por descricao normalizada
    const grupos = new Map();

    for (const item of rmItens) {
      // Chave de agrupamento: descricao + material (normalizado)
      const descNorm = item.descricao.trim().toUpperCase();
      const key = descNorm;

      if (!grupos.has(key)) {
        grupos.set(key, {
          descricao: item.descricao.trim(),
          material: item.material || null,
          unidade: "KG",
          ehMaterial: item.peso > 0, // true = materia prima (tem peso), false = parafuso/tinta/acessorio
          itens: [],
          ops: new Map(),
          rms: new Map(),
        });
      }

      const grupo = grupos.get(key);
      const qtdEfetiva = item.peso > 0 ? Number(item.peso) : item.qtd;
      const cotVencedor = item.cotacaoItens?.[0] || null;
      // Pedido: primeiro tenta via cotacao, depois via vinculo direto no RMItem
      const pedidoViaCot = cotVencedor?.cotacao?.pedidosOmie?.[0] || null;
      const pedido = pedidoViaCot || item.pedidoOmie || null;
      const fornecedorNome = cotVencedor?.cotacao?.fornecedor?.razaoSocial
        || pedido?.fornecedorNome
        || cotVencedor?.cotacao?.fornecedorNome
        || null;

      // Calcula qtd recebida real (soma dos registros de Recebimento)
      const qtdRecebidaItem = (item.recebimentos || []).reduce((s, r) => s + r.qtdRecebida, 0);
      const recebidoCompleto = qtdRecebidaItem >= qtdEfetiva;
      // Fallback: se nao tem registros de Recebimento mas pedido marcou dataEntregaReal, considerar recebido
      const recebidoLegacy = !!pedido?.dataEntregaReal && qtdRecebidaItem === 0;
      const qtdRecebidaFinal = recebidoLegacy ? qtdEfetiva : qtdRecebidaItem;

      grupo.itens.push({
        rmItemId: item.id,
        rmId: item.rm.id,
        rmNumero: item.rm.numero,
        opId: item.rm.op?.id || null,
        opNumero: item.rm.op?.numero || null,
        opCliente: item.rm.op?.cliente || null,
        qtd: qtdEfetiva,
        qtdRecebida: qtdRecebidaFinal,
        status: item.status,
        fornecedor: fornecedorNome,
        temPedido: !!pedido,
        recebido: recebidoCompleto || recebidoLegacy,
        recebidoParcial: qtdRecebidaFinal > 0 && !recebidoCompleto && !recebidoLegacy,
        prazoEntrega: cotVencedor?.prazoEntrega || pedido?.prazoEntregaPrevisto || null,
        statusEntrega: pedido?.statusEntrega || null,
        precoUnit: cotVencedor?.precoUnit || 0,
        valorLinha: (cotVencedor?.precoUnit || 0) * (cotVencedor?.qtdCotada || 0),
        nfNumero: item.recebimentos?.[0]?.nfNumero || null,
      });

      // Acumula OPs e RMs unicas
      if (item.rm.op) grupo.ops.set(item.rm.op.id, `OP ${item.rm.op.numero}`);
      grupo.rms.set(item.rm.id, `RM ${item.rm.numero}`);
    }

    // Monta resultado final com totais
    const data = Array.from(grupos.values()).map((g) => {
      const qtdSolicitada = g.itens.reduce((s, i) => s + i.qtd, 0);
      const qtdPedida = g.itens.filter((i) => i.temPedido).reduce((s, i) => s + i.qtd, 0);
      // Usa qtdRecebida real (de Recebimento records) em vez de boolean
      const qtdRecebida = g.itens.reduce((s, i) => s + (i.qtdRecebida || 0), 0);
      const saldoPendente = qtdPedida - qtdRecebida;
      const qtdSemPedido = qtdSolicitada - qtdPedida;
      const valorTotal = g.itens.reduce((s, i) => s + i.valorLinha, 0);

      // Proxima previsao de entrega (entre itens pendentes)
      const prevEntregas = g.itens
        .filter((i) => i.temPedido && !i.recebido && i.prazoEntrega)
        .map((i) => new Date(i.prazoEntrega))
        .sort((a, b) => a.getTime() - b.getTime());
      const proxEntrega = prevEntregas.length > 0 ? prevEntregas[0].toISOString() : null;

      // Fornecedores unicos
      const fornecedores = [...new Set(g.itens.map((i) => i.fornecedor).filter(Boolean))];

      return {
        descricao: g.descricao,
        material: g.material,
        unidade: g.unidade,
        ehMaterial: g.ehMaterial,
        qtdSolicitada,
        qtdPedida,
        qtdRecebida,
        saldoPendente,
        qtdSemPedido,
        valorTotal,
        proxEntrega,
        fornecedores,
        ops: Array.from(g.ops.values()),
        rms: Array.from(g.rms.values()),
        linhas: g.itens.length,
        detalhes: g.itens, // pra expansao
      };
    });

    // Ordena: sem pedido primeiro, depois saldo pendente (mais urgente)
    data.sort((a, b) => {
      if (a.qtdSemPedido > 0 && b.qtdSemPedido === 0) return -1;
      if (a.qtdSemPedido === 0 && b.qtdSemPedido > 0) return 1;
      if (a.saldoPendente > 0 && b.saldoPendente === 0) return -1;
      if (a.saldoPendente === 0 && b.saldoPendente > 0) return 1;
      return a.descricao.localeCompare(b.descricao);
    });

    // Totais de peso (só matéria prima — exclui parafusos, tinta, acessórios)
    const soMaterial = data.filter((d) => d.ehMaterial);
    const solicitado = soMaterial.reduce((s, d) => s + d.qtdSolicitada, 0);
    const pedido = soMaterial.reduce((s, d) => s + d.qtdPedida, 0);
    const recebido = soMaterial.reduce((s, d) => s + d.qtdRecebida, 0);
    const pesoTotais = {
      solicitado,
      pedido,
      recebido,
      aComprar: solicitado - pedido,       // ainda nao tem pedido
      aReceber: pedido - recebido,         // pedido mas nao chegou
      saldo: solicitado - recebido,        // total que falta chegar
    };

    return NextResponse.json({ success: true, data, pesoTotais });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
