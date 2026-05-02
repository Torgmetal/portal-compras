// Gera pedidos no Omie agrupando os vencedores da OP por (cotacao × faturamentoDireto).
// Itens com faturamentoDireto = true viram um pedido separado e tem nQtdeParc = 0
// (Omie nao gera contas a pagar nesse caso — controle apenas pra gasto da OP).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarPedidoOmie } from "@/lib/omie-pedido-compra";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode gerar pedidos." }, { status: 403 });
  }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    include: {
      rms: {
        include: {
          itens: {
            include: {
              opItem: { select: { faturamentoDireto: true, codigoOmie: true, categoria: true } },
              aditivoItem: { select: { faturamentoDireto: true, codigoOmie: true, categoria: true } },
            },
          },
          cotacoes: {
            where: { status: "RECEBIDA" },
            include: {
              itens: { where: { vencedor: true } },
            },
          },
        },
      },
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  // Agrupa: { [cotacaoId × isFD]: { cotacao, isFD, rmItens[], cotItens[] } }
  const grupos = new Map();

  for (const rm of op.rms) {
    for (const cot of rm.cotacoes) {
      for (const ci of cot.itens) {
        if (!ci.vencedor || !ci.precoUnit || ci.precoUnit <= 0) continue;
        const rmItem = rm.itens.find((i) => i.id === ci.rmItemId);
        if (!rmItem) continue;
        if (rmItem.status === "PEDIDO_GERADO" || rmItem.status === "CANCELADO") continue;

        const isFD =
          rmItem.opItem?.faturamentoDireto || rmItem.aditivoItem?.faturamentoDireto || false;
        const codigoOmieItem = rmItem.opItem?.codigoOmie || rmItem.aditivoItem?.codigoOmie || null;
        const chave = `${cot.id}|${isFD ? "FD" : "NORMAL"}`;

        if (!grupos.has(chave)) {
          grupos.set(chave, {
            cotacao: cot,
            rm,
            isFD,
            linhas: [],
          });
        }
        grupos.get(chave).linhas.push({ rmItem, cotItem: ci, codigoOmieItem });
      }
    }
  }

  if (grupos.size === 0) {
    return NextResponse.json(
      { error: "Nenhum vencedor selecionado. Marque vencedores no Mapa antes de gerar pedidos." },
      { status: 400 }
    );
  }

  const resultados = [];

  for (const grupo of grupos.values()) {
    const { cotacao, rm, isFD, linhas } = grupo;

    const itensPayload = linhas.map((l) => ({
      codigo: l.codigoOmieItem || null,
      descricao: l.rmItem.descricao,
      unidade: l.rmItem.unidade,
      qtd: Number(l.cotItem.qtdCotada) || 0,
      precoUnit: Number(l.cotItem.precoUnit) || 0,
    }));

    const total = itensPayload.reduce((s, it) => s + it.qtd * it.precoUnit, 0);
    const cNumPedido = `${rm.numero}${isFD ? "-FD" : ""}`;
    const observacaoBase = [
      `Pedido via Portal Torg — RM ${rm.numero}`,
      `Cliente: ${op.cliente}`,
      isFD ? "FATURAMENTO DIRETO — encerrar sem contas a pagar" : null,
      cotacao.observacao || null,
    ]
      .filter(Boolean)
      .join(" | ");

    // Categoria e local de estoque vem da RM (escolhidos pelo Compras)
    const cCodCateg = rm.categoriaCompra || "";
    const cCodLocalEstoque = rm.localEstoque || "";

    // Chama a lib server-side direto (sem fetch interno — evita problema
    // de auth do middleware bloquear chamada interna).
    let pedidoCriado = null;
    let erroPedido = null;
    try {
      const data = await criarPedidoOmie({
        itens: itensPayload,
        observacao: observacaoBase,
        nCodFor: Number(cotacao.nCodOmie) || 0,
        cnpjFornecedor: cotacao.cnpj || null,
        cNumPedido,
        nQtdeParc: isFD ? 0 : 1,
        cCodCateg,
        cCodLocalEstoque,
        cInfAdic: `OP ${op.numero}`,
      });
      if (data.error) {
        erroPedido = data.error;
        pedidoCriado = data; // pra preservar nCodFor_resolvido se houver
      } else {
        pedidoCriado = data;
      }
    } catch (e) {
      erroPedido = e.message;
    }

    // Persiste o pedido no banco (sucesso ou erro — pra historico)
    const pedidoOmie = await prisma.pedidoOmie.create({
      data: {
        cotacaoId: cotacao.id,
        fornecedorNome: cotacao.fornecedorNome,
        nCodFor: pedidoCriado?.nCodFor_resolvido?.toString() || cotacao.nCodOmie || null,
        cnpj: cotacao.cnpj || null,
        codigoPedido: pedidoCriado?.codigo_pedido?.toString() || null,
        numeroPedido: pedidoCriado?.numero_pedido?.toString() || null,
        total,
        faturamentoDireto: isFD,
        status: erroPedido ? "ERRO" : "CRIADO",
        observacao: observacaoBase,
        erroOmie: erroPedido,
        payload: itensPayload,
        resposta: pedidoCriado || null,
        createdById: user.id,
      },
    });

    if (!erroPedido) {
      // Marca os RMItens como PEDIDO_GERADO e vincula ao PedidoOmie
      await prisma.rMItem.updateMany({
        where: { id: { in: linhas.map((l) => l.rmItem.id) } },
        data: { status: "PEDIDO_GERADO", pedidoOmieId: pedidoOmie.id },
      });
    }

    resultados.push({
      pedidoOmieId: pedidoOmie.id,
      fornecedor: cotacao.fornecedorNome,
      isFD,
      total,
      itens: linhas.length,
      sucesso: !erroPedido,
      codigoPedido: pedidoCriado?.codigo_pedido || null,
      numeroPedido: pedidoCriado?.numero_pedido || null,
      erro: erroPedido,
    });

    // Pequena pausa entre chamadas pra evitar rate limit do Omie
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Atualiza status das RMs envolvidas — se todos itens viraram pedido ou foram cancelados, RM = PEDIDO_GERADO
  const rmIdsAfetadas = [...new Set(op.rms.map((r) => r.id))];
  for (const rmId of rmIdsAfetadas) {
    const rmItens = await prisma.rMItem.findMany({
      where: { rmId },
      select: { status: true },
    });
    const todosFinalizados = rmItens.every(
      (i) => i.status === "PEDIDO_GERADO" || i.status === "CANCELADO"
    );
    if (todosFinalizados && rmItens.length > 0) {
      await prisma.rM.update({ where: { id: rmId }, data: { status: "PEDIDO_GERADO" } });
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "gerar_pedidos_omie",
      entity: "OP",
      entityId: op.id,
      diff: {
        opNumero: op.numero,
        pedidos: resultados.length,
        sucesso: resultados.filter((r) => r.sucesso).length,
        erros: resultados.filter((r) => !r.sucesso).length,
      },
    },
  });

  return NextResponse.json({ ok: true, resultados });
}
