// Gera pedidos no Omie agrupando os vencedores da OP por (cotacao × faturamentoDireto).
// Itens com faturamentoDireto = true viram um pedido separado e tem nQtdeParc = 0
// (Omie nao gera contas a pagar nesse caso — controle apenas pra gasto da OP).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarPedidoOmie, anexarAoPedidoOmie } from "@/lib/omie-pedido-compra";
import { resolverCodProjetoPorOp } from "@/lib/omie-pedidos-abertos";
import { fdPorCategoriaDaOP, rmEhFD, itemEhFD } from "@/lib/faturamento-direto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode gerar pedidos." }, { status: 403 });
  }

  // Categoria + Local + CNPJs por cotacao + filtro opcional vem do body (modal).
  // Se cotacoesIds vier preenchido, gera so essas cotacoes (1-a-1).
  // Se vazio/omisso, gera todas as cotacoes da OP que tem vencedores.
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

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    include: {
      // itens/aditivos da OP p/ o fallback de FD por categoria (RMItem.opItemId
      // raramente é preenchido — ver lib/faturamento-direto.js)
      itens: { select: { categoria: true, faturamentoDireto: true } },
      aditivos: { select: { itens: { select: { categoria: true, faturamentoDireto: true } } } },
      rms: {
        include: {
          itens: {
            include: {
              opItem: { select: { faturamentoDireto: true, codigoOmie: true, categoria: true } },
              aditivoItem: { select: { faturamentoDireto: true, codigoOmie: true, categoria: true } },
            },
          },
        },
      },
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  // FD por RM (fallback por categoria, mesma lógica do painel de OPs).
  const fdPorCategoria = fdPorCategoriaDaOP(op);
  const fdPorRM = new Map(op.rms.map((rm) => [rm.id, rmEhFD(rm, fdPorCategoria) === true]));

  // Mapa global de RMItem por id — inclui itens de todas as RMs da OP.
  // Usado pra resolver itens de cotacoes consolidadas (multi-RM) onde
  // o rmItem pode pertencer a uma RM diferente da rmId primaria da cotacao.
  const rmIdsDaOP = op.rms.map((r) => r.id);
  const itemPorId = new Map(); // rmItemId -> { rmItem, rm }
  for (const rm of op.rms) {
    for (const item of rm.itens) {
      itemPorId.set(item.id, { rmItem: item, rm });
    }
  }

  // Busca todas as cotacoes RECEBIDAS que tocam essa OP — primaria por rmId
  // OU por qualquer item ligado a uma RM dessa OP (consolidadas).
  const cotacoesRecebidas = await prisma.cotacao.findMany({
    where: {
      status: "RECEBIDA",
      OR: [
        { rmId: { in: rmIdsDaOP } },
        { itens: { some: { rmItem: { rmId: { in: rmIdsDaOP } } } } },
      ],
    },
    include: {
      itens: { where: { vencedor: true } },
    },
  });

  // Resolve o código do projeto Omie da OP uma vez (cacheado). Best-effort:
  // se não houver projeto cadastrado, o pedido sai sem projeto (não quebra).
  let nCodProjOP = null;
  try { nCodProjOP = await resolverCodProjetoPorOp(op.numero); }
  catch (e) { console.error("[gerar-pedidos] falha ao resolver projeto:", e?.message); }

  // Agrupa: { [cotacaoId × isFD]: { cotacao, isFD, linhas[], rmIdsEnvolvidas } }
  const grupos = new Map();

  for (const cot of cotacoesRecebidas) {
    // Filtro: gera so as cotacoes selecionadas (modo 1-a-1)
    if (cotacoesFiltro && !cotacoesFiltro.includes(cot.id)) continue;
    for (const ci of cot.itens) {
      if (!ci.vencedor || !ci.precoUnit || ci.precoUnit <= 0) continue;
      const entry = itemPorId.get(ci.rmItemId);
      if (!entry) continue; // item de RM fora dessa OP — pula
      const { rmItem, rm } = entry;
      if (rmItem.status === "PEDIDO_GERADO" || rmItem.status === "CANCELADO" || rmItem.status === "ATENDIDO_ESTOQUE") continue;

      const isFD = itemEhFD(rmItem, fdPorRM);
      // Prioridade: codigoOmieEstoque do RMItem (vem do cadastro de estoque) >
      // codigoOmie do OPItem/AditivoItem (cadastrado pelo Comercial) > busca por descricao
      const codigoOmieItem =
        rmItem.codigoOmieEstoque || rmItem.opItem?.codigoOmie || rmItem.aditivoItem?.codigoOmie || null;
      const chave = `${cot.id}|${isFD ? "FD" : "NORMAL"}`;

      if (!grupos.has(chave)) {
        grupos.set(chave, {
          cotacao: cot,
          isFD,
          linhas: [],
          rmIdsEnvolvidas: new Set(),
        });
      }
      grupos.get(chave).rmIdsEnvolvidas.add(rm.id);
      grupos.get(chave).linhas.push({ rmItem, cotItem: ci, codigoOmieItem, rm });
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
    const { cotacao, isFD, linhas, rmIdsEnvolvidas } = grupo;

    // Lista de RMs envolvidas — pode ser mais de uma em cotacao consolidada
    const rmNumeros = [...rmIdsEnvolvidas]
      .map((id) => op.rms.find((r) => r.id === id)?.numero)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    // Embute IPI no preco unitario enviado ao Omie pra que o TOTAL do pedido
    // bata com o valor da nota fiscal que o fornecedor vai emitir.
    // ICMS nao entra (ele vem implicito no preco bruto e e creditado pela Torg).
    // PedidoOmie.total armazena o mesmo valor (com IPI), facilitando conciliacao.
    const itensPayloadBase = linhas.map((l) => {
      const ipiPct = Number(l.cotItem.ipiPct) || 0;
      const precoBruto = Number(l.cotItem.precoUnit) || 0;
      const precoComIPI = precoBruto * (1 + ipiPct / 100);
      // Itens com abatimento de estoque (qtdPecasCotada setado): usa a qtdCotada
      // liquida; se o fornecedor zerou a qtd, reconstroi o liquido pela proporcao
      // de barras. Itens sem abatimento (incl. cotacoes legadas): comportamento
      // original — peso cheio da RM, com fallback na qtdCotada.
      let qtdKg;
      if (l.cotItem.qtdPecasCotada != null) {
        const pesoRm = Number(l.rmItem.peso) || 0;
        const qtdRm = Number(l.rmItem.qtd) || 0;
        const pesoLiquido = pesoRm > 0 && qtdRm > 0
          ? Math.round((pesoRm * Number(l.cotItem.qtdPecasCotada) / qtdRm) * 100) / 100
          : Number(l.cotItem.qtdPecasCotada);
        qtdKg = Number(l.cotItem.qtdCotada) > 0 ? Number(l.cotItem.qtdCotada) : pesoLiquido;
      } else {
        qtdKg = l.rmItem.peso > 0 ? Number(l.rmItem.peso) : Number(l.cotItem.qtdCotada) || 0;
      }
      return {
        codigo: l.codigoOmieItem || null,
        descricao: l.rmItem.descricao,
        unidade: l.rmItem.unidade || "KG",
        qtd: qtdKg,
        precoUnit: precoComIPI,
      };
    });
    const totalCalculado = itensPayloadBase.reduce((s, it) => s + it.qtd * it.precoUnit, 0);

    // Se a cotacao tem totalProposta setado (valor exato do PDF do fornecedor),
    // escala todos os precos proporcionalmente pra bater com esse total.
    // Garante que o pedido no Omie = total da NF do fornecedor.
    const totalProposta = Number(cotacao.totalProposta) || 0;
    let itensPayload = itensPayloadBase;
    let totalAjustado = false;
    if (totalProposta > 0 && totalCalculado > 0 && Math.abs(totalCalculado - totalProposta) > 0.01) {
      const fator = totalProposta / totalCalculado;
      itensPayload = itensPayloadBase.map((it) => ({
        ...it,
        precoUnit: Math.round(it.precoUnit * fator * 10000) / 10000, // 4 casas pra precisao
      }));
      totalAjustado = true;
    }

    const total = itensPayload.reduce((s, it) => s + it.qtd * it.precoUnit, 0);

    // Indica se houve algum item com IPI > 0 — pra adicionar nota na observacao
    const temIPI = linhas.some((l) => Number(l.cotItem.ipiPct) > 0);
    // Detecta se TODOS os itens deste grupo sao destinoEstoque (compra pra
    // estoque torg). Nesse caso, o pedido no Omie nao cita OP especifica —
    // entra como compra consolidada.
    const todosEstoque = linhas.every((l) => l.rmItem.destinoEstoque === true);
    // cNumPedido tem limite de tamanho no Omie
    let cNumPedido;
    if (todosEstoque && !isFD) {
      // Compra pra estoque: nao cita OP, usa RM como referencia
      cNumPedido = rmNumeros.length === 1
        ? `EST-${rmNumeros[0]}`
        : `EST-${rmNumeros[0]}+${rmNumeros.length - 1}`;
    } else {
      cNumPedido = rmNumeros.length === 1
        ? `${rmNumeros[0]}${isFD ? "-FD" : ""}`
        : `${rmNumeros[0]}+${rmNumeros.length - 1}${isFD ? "-FD" : ""}`;
    }
    const observacaoBase = [
      todosEstoque && !isFD
        ? `Compra consolidada pro estoque — RMs ${rmNumeros.join(", ")}`
        : rmNumeros.length === 1
        ? `Pedido via Workspace Torg — RM ${rmNumeros[0]}`
        : `Pedido via Workspace Torg — RMs ${rmNumeros.join(", ")}`,
      todosEstoque && !isFD ? null : `Cliente: ${op.cliente}`,
      isFD ? "FATURAMENTO DIRETO — encerrar sem contas a pagar" : null,
      temIPI ? "Preço unitário inclui IPI (para bater total com NF do fornecedor)" : null,
      totalAjustado ? `Preços ajustados pro total bater com proposta do fornecedor (R$ ${totalProposta.toFixed(2)})` : null,
      cotacao.numeroProposta ? `Proposta forn.: ${cotacao.numeroProposta}` : null,
      cotacao.observacao || null,
    ]
      .filter(Boolean)
      .join(" | ");

    // Categoria e local de estoque vem do modal de geracao (uma vez pra todos)
    const cCodCateg = categoriaSelecionada;
    const cCodLocalEstoque = localSelecionado;

    // CNPJ vem do modal (override) ou cai pro que ja estava na cotacao
    const cnpjFinal = cnpjsPorCotacao[cotacao.id] || cotacao.cnpj || null;

    // Atualiza cnpj na Cotacao se o modal trouxe um valor diferente
    if (cnpjFinal && cnpjFinal !== cotacao.cnpj) {
      try {
        await prisma.cotacao.update({
          where: { id: cotacao.id },
          data: { cnpj: cnpjFinal },
        });
      } catch {}
    }

    // Chama a lib server-side direto (sem fetch interno — evita problema
    // de auth do middleware bloquear chamada interna).
    let pedidoCriado = null;
    let erroPedido = null;
    try {
      const data = await criarPedidoOmie({
        itens: itensPayload,
        observacao: observacaoBase,
        nCodFor: Number(cotacao.nCodOmie) || 0,
        cnpjFornecedor: cnpjFinal,
        cNumPedido,
        nQtdeParc: isFD ? 0 : 1,
        cCodCateg,
        cCodLocalEstoque,
        cInfAdic: `OP ${op.numero}`,
        nCodProj: nCodProjOP,
        prazoPagamento: cotacao.prazoPagamento,
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

    // Persiste o pedido no banco SO se foi criado com sucesso no Omie.
    // Erros nao poluem o historico — ficam apenas no AuditLog pra debug.
    let pedidoOmie = null;
    if (!erroPedido) {
      // Persistência local atômica: gravar o PedidoOmie e marcar os RMItem como
      // PEDIDO_GERADO na MESMA transação. Se o updateMany falhasse isolado após o
      // pedido já existir no Omie, os itens ficariam "abertos" e a próxima geração
      // criaria um pedido DUPLICADO no Omie.
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
            faturamentoDireto: isFD,
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
      // Erro: registra no audit pra rastreabilidade, sem criar PedidoOmie
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "gerar_pedido_erro",
          entity: "Cotacao",
          entityId: cotacao.id,
          diff: {
            fornecedor: cotacao.fornecedorNome,
            isFD,
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
      // Envia anexos pro Omie via API de anexos com URL externa.
      // Inclui: PDFs da cotacao (proposta do fornecedor) + anexos das RMs
      // envolvidas no grupo (drawings, especificacoes, planilha Tekla).
      // Best-effort: erro em anexo nao quebra o fluxo.
      try {
        const nCodPed = Number(pedidoCriado?.codigo_pedido) || null;
        if (nCodPed) {
          const rmIdsDoGrupo = [...rmIdsEnvolvidas];
          const [anexosCot, anexosRMs] = await Promise.all([
            prisma.anexo.findMany({
              where: { cotacaoId: cotacao.id },
              select: { nomeArquivo: true, blobUrl: true, tipo: true },
            }),
            prisma.anexo.findMany({
              where: { rmId: { in: rmIdsDoGrupo } },
              select: { nomeArquivo: true, blobUrl: true, tipo: true },
            }),
          ]);
          const todosAnexos = [...anexosCot, ...anexosRMs];
          if (todosAnexos.length > 0) {
            resAnexos = await anexarAoPedidoOmie({ nCodPed, anexos: todosAnexos });
            // Guarda resultado no PedidoOmie.resposta pra rastreabilidade
            await prisma.pedidoOmie.update({
              where: { id: pedidoOmie.id },
              data: {
                resposta: {
                  ...(pedidoOmie.resposta || {}),
                  pedido_criado: pedidoCriado,
                  anexos: resAnexos,
                },
              },
            }).catch((e) => console.error("[anexos] falha atualizando resposta:", e?.message));
          }
        }
      } catch (e) {
        console.error("[gerar-pedidos anexar] erro:", e?.message);
        resAnexos = { anexados: 0, erros: [{ error: e?.message }] };
      }
    }

    resultados.push({
      pedidoOmieId: pedidoOmie?.id || null,
      fornecedor: cotacao.fornecedorNome,
      isFD,
      total,
      itens: linhas.length,
      sucesso: !erroPedido,
      codigoPedido: pedidoCriado?.codigo_pedido || null,
      numeroPedido: pedidoCriado?.numero_pedido || null,
      anexos: resAnexos ? { anexados: resAnexos.anexados, erros: resAnexos.erros?.length || 0 } : null,
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
      (i) => ["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"].includes(i.status)
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
