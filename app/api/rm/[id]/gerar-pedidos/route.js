// Gera pedidos no Omie para uma RM individual (sem OP vinculada).
// Fluxo paralelo ao /api/op/[id]/gerar-pedidos, mas opera em escopo de RM.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarPedidoOmie, anexarAoPedidoOmie } from "@/lib/omie-pedido-compra";
import { resolverCodProjetoPorOp } from "@/lib/omie-pedidos-abertos";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode gerar pedidos." }, { status: 403 });
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const categoriaSelecionada = String(body.categoria || "").trim();
  const localSelecionado = String(body.localEstoque || "").trim();
  const cnpjsPorCotacao = body.cnpjsPorCotacao || {};
  const cotacoesFiltro = Array.isArray(body.cotacoesIds) ? body.cotacoesIds : null;

  if (!categoriaSelecionada) {
    return NextResponse.json({ error: "Categoria de Compra é obrigatória." }, { status: 400 });
  }
  if (!localSelecionado) {
    return NextResponse.json({ error: "Local de Estoque é obrigatório." }, { status: 400 });
  }

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: {
      itens: true,
      op: { select: { numero: true } },
    },
  });
  if (!rm) return NextResponse.json({ error: "RM não encontrada." }, { status: 404 });

  // Projeto Omie da OP vinculada à RM (best-effort; RM Interna pode não ter OP).
  let nCodProjOP = null;
  if (rm.op?.numero) {
    try { nCodProjOP = await resolverCodProjetoPorOp(rm.op.numero); }
    catch (e) { console.error("[rm gerar-pedidos] falha ao resolver projeto:", e?.message); }
  }

  const itemPorId = new Map();
  for (const item of rm.itens) {
    itemPorId.set(item.id, { rmItem: item, rm });
  }

  // Busca cotacoes RECEBIDAS vinculadas a essa RM
  const cotacoesRecebidas = await prisma.cotacao.findMany({
    where: {
      status: "RECEBIDA",
      OR: [
        { rmId: rm.id },
        { itens: { some: { rmItem: { rmId: rm.id } } } },
      ],
    },
    include: {
      itens: { where: { vencedor: true } },
    },
  });

  // Agrupa: { [cotacaoId × isFD]: { cotacao, linhas[] } }
  const grupos = new Map();

  for (const cot of cotacoesRecebidas) {
    if (cotacoesFiltro && !cotacoesFiltro.includes(cot.id)) continue;
    for (const ci of cot.itens) {
      if (!ci.vencedor || !ci.precoUnit || ci.precoUnit <= 0) continue;
      const entry = itemPorId.get(ci.rmItemId);
      if (!entry) continue;
      const { rmItem } = entry;
      if (rmItem.status === "PEDIDO_GERADO" || rmItem.status === "CANCELADO" || rmItem.status === "ATENDIDO_ESTOQUE") continue;

      // RMs internas sem OP não têm opItem/aditivoItem, então FD = false
      const isFD = false;
      const codigoOmieItem = rmItem.codigoOmieEstoque || null;
      const chave = `${cot.id}|NORMAL`;

      if (!grupos.has(chave)) {
        grupos.set(chave, { cotacao: cot, isFD: false, linhas: [] });
      }
      grupos.get(chave).linhas.push({ rmItem, cotItem: ci, codigoOmieItem });
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
    const { cotacao, linhas } = grupo;

    const itensPayloadBase = linhas.map((l) => {
      const ipiPct = Number(l.cotItem.ipiPct) || 0;
      const precoBruto = Number(l.cotItem.precoUnit) || 0;
      const precoComIPI = precoBruto * (1 + ipiPct / 100);
      // qtdCotada e a quantidade efetiva (em KG p/ aco): ja vem liquida do
      // abatimento de estoque da consulta e pode ter sido ajustada pelo
      // fornecedor. Fallback no peso da RM so para cotacoes legadas sem qtdCotada.
      const qtdKg = Number(l.cotItem.qtdCotada) > 0
        ? Number(l.cotItem.qtdCotada)
        : (l.rmItem.peso > 0 ? Number(l.rmItem.peso) : 0);
      return {
        codigo: l.codigoOmieItem || null,
        descricao: l.rmItem.descricao,
        unidade: l.rmItem.unidade || "KG",
        qtd: qtdKg,
        precoUnit: precoComIPI,
      };
    });
    const totalCalculado = itensPayloadBase.reduce((s, it) => s + it.qtd * it.precoUnit, 0);

    const totalProposta = Number(cotacao.totalProposta) || 0;
    let itensPayload = itensPayloadBase;
    if (totalProposta > 0 && totalCalculado > 0 && Math.abs(totalCalculado - totalProposta) > 0.01) {
      const fator = totalProposta / totalCalculado;
      itensPayload = itensPayloadBase.map((it) => ({
        ...it,
        precoUnit: Math.round(it.precoUnit * fator * 10000) / 10000,
      }));
    }

    const total = itensPayload.reduce((s, it) => s + it.qtd * it.precoUnit, 0);
    const temIPI = linhas.some((l) => Number(l.cotItem.ipiPct) > 0);
    const cNumPedido = rm.numero;
    const observacaoBase = [
      `Pedido via Workspace Torg — RM ${rm.numero} (${rm.descricao || "Interna"})`,
      temIPI ? "Preço unitário inclui IPI" : null,
      totalProposta > 0 && Math.abs(totalCalculado - totalProposta) > 0.01
        ? `Preços ajustados pro total bater com proposta (R$ ${totalProposta.toFixed(2)})` : null,
      cotacao.numeroProposta ? `Proposta forn.: ${cotacao.numeroProposta}` : null,
      cotacao.observacao || null,
    ].filter(Boolean).join(" | ");

    const cnpjFinal = cnpjsPorCotacao[cotacao.id] || cotacao.cnpj || null;

    if (cnpjFinal && cnpjFinal !== cotacao.cnpj) {
      try {
        await prisma.cotacao.update({
          where: { id: cotacao.id },
          data: { cnpj: cnpjFinal },
        });
      } catch {}
    }

    let pedidoCriado = null;
    let erroPedido = null;
    try {
      const data = await criarPedidoOmie({
        itens: itensPayload,
        observacao: observacaoBase,
        nCodFor: Number(cotacao.nCodOmie) || 0,
        cnpjFornecedor: cnpjFinal,
        cNumPedido,
        nQtdeParc: 1,
        cCodCateg: categoriaSelecionada,
        cCodLocalEstoque: localSelecionado,
        cInfAdic: `RM Interna ${rm.numero}`,
        nCodProj: nCodProjOP,
        prazoPagamento: cotacao.prazoPagamento,
      });
      if (data.error) {
        erroPedido = data.error;
        pedidoCriado = data;
      } else {
        pedidoCriado = data;
      }
    } catch (e) {
      erroPedido = e.message;
    }

    let pedidoOmie = null;
    if (!erroPedido) {
      // Persistência local atômica: gravar o PedidoOmie e marcar os RMItem como
      // PEDIDO_GERADO na MESMA transação. Se o updateMany falhasse isolado (OOM,
      // timeout) após o pedido já existir no Omie, os itens ficariam "abertos" e
      // a próxima geração criaria um pedido DUPLICADO no Omie.
      pedidoOmie = await prisma.$transaction(async (tx) => {
        const pedido = await tx.pedidoOmie.create({
          data: {
            cotacaoId: cotacao.id,
            fornecedorNome: cotacao.fornecedorNome,
            nCodFor: pedidoCriado?.nCodFor_resolvido?.toString() || cotacao.nCodOmie || null,
            cnpj: cnpjFinal || null,
            codigoPedido: pedidoCriado?.codigo_pedido?.toString() || null,
            numeroPedido: pedidoCriado?.numero_pedido?.toString() || null,
            total,
            faturamentoDireto: false,
            status: "CRIADO",
            observacao: observacaoBase,
            payload: itensPayload,
            resposta: pedidoCriado || null,
            createdById: user.id,
          },
        });
        await tx.rMItem.updateMany({
          where: { id: { in: linhas.map((l) => l.rmItem.id) } },
          data: { status: "PEDIDO_GERADO", pedidoOmieId: pedido.id },
        });
        return pedido;
      });
    } else {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "gerar_pedido_erro",
          entity: "RM",
          entityId: rm.id,
          diff: {
            fornecedor: cotacao.fornecedorNome,
            total,
            itens: linhas.length,
            erro: erroPedido,
            cNumPedido,
          },
        },
      }).catch(() => {});
    }

    let resAnexos = null;
    if (!erroPedido) {
      // Itens já foram marcados como PEDIDO_GERADO dentro da transação acima.
      try {
        const nCodPed = Number(pedidoCriado?.codigo_pedido) || null;
        if (nCodPed) {
          const [anexosCot, anexosRM] = await Promise.all([
            prisma.anexo.findMany({
              where: { cotacaoId: cotacao.id },
              select: { nomeArquivo: true, blobUrl: true, tipo: true },
            }),
            prisma.anexo.findMany({
              where: { rmId: rm.id },
              select: { nomeArquivo: true, blobUrl: true, tipo: true },
            }),
          ]);
          const todosAnexos = [...anexosCot, ...anexosRM];
          if (todosAnexos.length > 0) {
            resAnexos = await anexarAoPedidoOmie({ nCodPed, anexos: todosAnexos });
            await prisma.pedidoOmie.update({
              where: { id: pedidoOmie.id },
              data: {
                resposta: {
                  ...(pedidoOmie.resposta || {}),
                  pedido_criado: pedidoCriado,
                  anexos: resAnexos,
                },
              },
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.error("[rm gerar-pedidos anexar] erro:", e?.message);
        resAnexos = { anexados: 0, erros: [{ error: e?.message }] };
      }
    }

    resultados.push({
      pedidoOmieId: pedidoOmie?.id || null,
      fornecedor: cotacao.fornecedorNome,
      isFD: false,
      total,
      itens: linhas.length,
      sucesso: !erroPedido,
      codigoPedido: pedidoCriado?.codigo_pedido || null,
      numeroPedido: pedidoCriado?.numero_pedido || null,
      anexos: resAnexos ? { anexados: resAnexos.anexados, erros: resAnexos.erros?.length || 0 } : null,
      erro: erroPedido,
    });

    await new Promise((r) => setTimeout(r, 1500));
  }

  // Atualiza status da RM
  const rmItens = await prisma.rMItem.findMany({
    where: { rmId: rm.id },
    select: { status: true },
  });
  const todosFinalizados = rmItens.every(
    (i) => ["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"].includes(i.status)
  );
  if (todosFinalizados && rmItens.length > 0) {
    await prisma.rM.update({ where: { id: rm.id }, data: { status: "PEDIDO_GERADO" } });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "gerar_pedidos_omie_rm",
      entity: "RM",
      entityId: rm.id,
      diff: {
        rmNumero: rm.numero,
        pedidos: resultados.length,
        sucesso: resultados.filter((r) => r.sucesso).length,
        erros: resultados.filter((r) => !r.sucesso).length,
      },
    },
  });

  return NextResponse.json({ ok: true, resultados });
}
