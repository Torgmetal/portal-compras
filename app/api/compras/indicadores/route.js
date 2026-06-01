import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET — Calcula indicadores de compras: Scorecard Fornecedor, Savings, OTIF.
// Query params: de (date), ate (date) — período de apuração.
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);

    const { searchParams } = new URL(req.url);
    const de = searchParams.get("de");
    const ate = searchParams.get("ate");

    // Período padrão: mês atual
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);
    const dataInicio = de ? new Date(de) : inicioMes;
    const dataFim = ate ? new Date(ate + "T23:59:59") : fimMes;

    // ─── 1. SCORECARD DE FORNECEDOR ──────────────────────────
    const scorecard = await calcularScorecard(dataInicio, dataFim);

    // ─── 2. SAVINGS POR OBRA ─────────────────────────────────
    const savings = await calcularSavings();

    // ─── 3. OTIF ─────────────────────────────────────────────
    const otif = await calcularOTIF(dataInicio, dataFim);

    // ─── 4. ATENDIMENTO INTERNO ──────────────────────────────
    const atendimento = await calcularAtendimento(dataInicio, dataFim);

    // ─── 5. NOTA DO SETOR COMPRAS ──────────────────────────────
    // Média ponderada dos 4 indicadores, normalizada 0-100.
    // Pesos: OTIF 30%, Savings 20%, Atendimento 25%, Scorecard 25%
    const notaSetor = calcularNotaSetor({ otif, savings, atendimento, scorecard });

    return NextResponse.json({
      success: true,
      periodo: { de: dataInicio.toISOString(), ate: dataFim.toISOString() },
      notaSetor,
      scorecard,
      savings,
      otif,
      atendimento,
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ─── SCORECARD ───────────────────────────────────────────────
async function calcularScorecard(dataInicio, dataFim) {
  // Busca cotações no período com dados do fornecedor
  const cotacoes = await prisma.cotacao.findMany({
    where: {
      createdAt: { gte: dataInicio, lte: dataFim },
      fornecedorId: { not: null },
    },
    select: {
      id: true,
      fornecedorId: true,
      fornecedorNome: true,
      fornecedor: { select: { id: true, razaoSocial: true } },
      createdAt: true,
      recebidaEm: true,
      prazoResposta: true,
      status: true,
      itens: {
        select: {
          id: true,
          rmItemId: true,
          precoUnit: true,
          qtdCotada: true,
          vencedor: true,
        },
      },
      pedidosOmie: {
        select: {
          id: true,
          prazoEntregaPrevisto: true,
          dataEntregaReal: true,
          itensOmie: true,
          total: true,
          recebimentos: {
            select: { qtdRecebida: true },
          },
        },
      },
    },
  });

  // Agrupa por fornecedor
  const porFornecedor = new Map();
  for (const cot of cotacoes) {
    const fId = cot.fornecedorId;
    if (!porFornecedor.has(fId)) {
      porFornecedor.set(fId, {
        id: fId,
        nome: cot.fornecedor?.razaoSocial || cot.fornecedorNome,
        cotacoes: [],
      });
    }
    porFornecedor.get(fId).cotacoes.push(cot);
  }

  // Para ranking de preço, precisa de TODAS as propostas do período por rmItemId
  const todosItens = cotacoes.flatMap((c) =>
    c.itens.map((it) => ({
      rmItemId: it.rmItemId,
      fornecedorId: c.fornecedorId,
      precoUnit: it.precoUnit,
    }))
  );
  // Agrupa preços por rmItemId para comparação
  const precoPorItem = new Map();
  for (const it of todosItens) {
    if (!precoPorItem.has(it.rmItemId)) precoPorItem.set(it.rmItemId, []);
    precoPorItem.get(it.rmItemId).push(it);
  }

  const fornecedores = [];
  for (const [fId, dados] of porFornecedor) {
    const cots = dados.cotacoes;

    // ── Critério 1: Prazo de Resposta (20%) ──
    // % de cotações respondidas dentro do prazo (prazoResposta ou 3 dias úteis)
    let rfqsEnviadas = cots.length;
    let rfqsNoPrazo = 0;
    for (const c of cots) {
      if (c.recebidaEm) {
        const prazoLimite = c.prazoResposta || adicionarDiasUteis(c.createdAt, 3);
        if (new Date(c.recebidaEm) <= new Date(prazoLimite)) {
          rfqsNoPrazo++;
        }
      }
    }
    const respondidas = cots.filter((c) => c.recebidaEm).length;
    const notaResposta = respondidas > 0 ? (rfqsNoPrazo / respondidas) * 100 : null;

    // ── Critério 2: Entrega no Prazo (40%) ──
    // % de pedidos entregues com desvio ≤ 0
    const pedidos = cots.flatMap((c) => c.pedidosOmie || []);
    const pedidosEntregues = pedidos.filter((p) => p.dataEntregaReal);
    let entregasNoPrazo = 0;
    for (const p of pedidosEntregues) {
      if (p.prazoEntregaPrevisto && new Date(p.dataEntregaReal) <= new Date(p.prazoEntregaPrevisto)) {
        entregasNoPrazo++;
      }
    }
    const notaEntrega = pedidosEntregues.length > 0
      ? (entregasNoPrazo / pedidosEntregues.length) * 100
      : null;

    // ── Critério 3: Qualidade (25%) ──
    // Placeholder: sem rastreamento de não-conformidade ainda → 100%
    const notaQualidade = pedidosEntregues.length > 0 ? 100 : null;

    // ── Critério 4: Preço/Competitividade (15%) ──
    // Posição relativa nas cotações: melhor preço = 100, pior = 0
    const itensFornecedor = todosItens.filter((it) => it.fornecedorId === fId);
    let somaScorePreco = 0;
    let itensComparados = 0;
    for (const it of itensFornecedor) {
      const concorrentes = precoPorItem.get(it.rmItemId) || [];
      if (concorrentes.length < 2) continue; // sem comparação
      // Ordena por preço crescente
      const ordenados = [...concorrentes].sort((a, b) => a.precoUnit - b.precoUnit);
      const posicao = ordenados.findIndex((x) => x.fornecedorId === fId) + 1;
      const total = ordenados.length;
      // Score: 1º lugar = 100, último = 0
      const score = total > 1 ? ((total - posicao) / (total - 1)) * 100 : 100;
      somaScorePreco += score;
      itensComparados++;
    }
    const notaPreco = itensComparados > 0 ? somaScorePreco / itensComparados : null;

    // ── Nota Final (média ponderada) ──
    // Só calcula se tiver pelo menos 2 critérios com dados
    const criterios = [
      { nota: notaResposta, peso: 0.20 },
      { nota: notaEntrega, peso: 0.40 },
      { nota: notaQualidade, peso: 0.25 },
      { nota: notaPreco, peso: 0.15 },
    ];
    const criteriosComDados = criterios.filter((c) => c.nota !== null);
    let notaFinal = null;
    if (criteriosComDados.length >= 1) {
      const pesoTotal = criteriosComDados.reduce((s, c) => s + c.peso, 0);
      notaFinal = criteriosComDados.reduce((s, c) => s + c.nota * c.peso, 0) / pesoTotal;
    }

    fornecedores.push({
      id: fId,
      nome: dados.nome,
      notaFinal: notaFinal !== null ? Math.round(notaFinal * 10) / 10 : null,
      resposta: {
        nota: notaResposta !== null ? Math.round(notaResposta * 10) / 10 : null,
        rfqsEnviadas,
        respondidas,
        noPrazo: rfqsNoPrazo,
      },
      entrega: {
        nota: notaEntrega !== null ? Math.round(notaEntrega * 10) / 10 : null,
        totalEntregues: pedidosEntregues.length,
        noPrazo: entregasNoPrazo,
      },
      qualidade: {
        nota: notaQualidade !== null ? Math.round(notaQualidade * 10) / 10 : null,
        obs: "Sem rastreamento de NC — padrão 100%",
      },
      preco: {
        nota: notaPreco !== null ? Math.round(notaPreco * 10) / 10 : null,
        itensComparados,
      },
      totalPedidos: pedidos.length,
    });
  }

  // Ordena por nota final decrescente
  fornecedores.sort((a, b) => (b.notaFinal ?? -1) - (a.notaFinal ?? -1));

  return { fornecedores };
}

// ─── SAVINGS ─────────────────────────────────────────────────
async function calcularSavings() {
  // Busca OPs com itens de verba e pedidos vinculados
  const ops = await prisma.oP.findMany({
    where: {
      status: { in: ["ABERTA", "EM_EXECUCAO", "ENCERRADA"] },
    },
    select: {
      id: true,
      numero: true,
      cliente: true,
      obra: true,
      status: true,
      itens: {
        select: { valorVerba: true, faturamentoDireto: true },
      },
      aditivos: {
        select: {
          itens: {
            select: { valorVerba: true, faturamentoDireto: true },
          },
        },
      },
      // Pedidos diretos (FD avulsos)
      pedidosOmieAvulsos: {
        where: { status: { not: "ERRO" } },
        select: { total: true },
      },
      // RMs vinculadas para achar pedidos via cotação
      rms: {
        select: {
          cotacoes: {
            select: {
              pedidosOmie: {
                where: { status: { not: "ERRO" } },
                select: { id: true, total: true },
              },
            },
          },
        },
      },
    },
  });

  const resultado = [];
  for (const op of ops) {
    // Verba disponível = soma de valorVerba dos OPItems + AditivoItems
    // Exclui itens FD (faturamento direto ao cliente — não sai do caixa Torg)
    const verbaItens = op.itens
      .filter((it) => !it.faturamentoDireto)
      .reduce((s, it) => s + (it.valorVerba || 0), 0);
    const verbaAditivos = op.aditivos
      .flatMap((a) => a.itens)
      .filter((it) => !it.faturamentoDireto)
      .reduce((s, it) => s + (it.valorVerba || 0), 0);
    const verbaDisponivel = verbaItens + verbaAditivos;

    if (verbaDisponivel <= 0) continue; // OP sem verba = não entra

    // Total realizado = soma dos pedidos de compra (deduplica por ID)
    const pedidosVistos = new Set();
    let totalRealizado = 0;

    // Pedidos via RM → Cotação
    for (const rm of op.rms) {
      for (const cot of rm.cotacoes) {
        for (const ped of cot.pedidosOmie) {
          if (!pedidosVistos.has(ped.id)) {
            pedidosVistos.add(ped.id);
            totalRealizado += ped.total || 0;
          }
        }
      }
    }
    // Pedidos diretos (FD avulsos)
    for (const ped of op.pedidosOmieAvulsos) {
      totalRealizado += ped.total || 0;
    }

    const savingsR$ = verbaDisponivel - totalRealizado;
    const savingsPct = (savingsR$ / verbaDisponivel) * 100;

    const statusObra = op.status === "ENCERRADA" ? "CONCLUIDA" : "EM_ANDAMENTO";

    resultado.push({
      opId: op.id,
      opNumero: op.numero,
      cliente: op.cliente,
      obra: op.obra,
      statusObra,
      verbaDisponivel,
      totalRealizado,
      savingsR$,
      savingsPct: Math.round(savingsPct * 10) / 10,
      qtdPedidos: pedidosVistos.size + op.pedidosOmieAvulsos.length,
    });
  }

  // Totais consolidados
  const totalVerba = resultado.reduce((s, r) => s + r.verbaDisponivel, 0);
  const totalGasto = resultado.reduce((s, r) => s + r.totalRealizado, 0);
  const totalSavings = totalVerba - totalGasto;
  const pctSavings = totalVerba > 0 ? (totalSavings / totalVerba) * 100 : 0;

  return {
    resumo: {
      totalVerba,
      totalGasto,
      totalSavings,
      pctSavings: Math.round(pctSavings * 10) / 10,
      qtdObras: resultado.length,
    },
    porObra: resultado.sort((a, b) => b.savingsR$ - a.savingsR$),
  };
}

// ─── OTIF ────────────────────────────────────────────────────
async function calcularOTIF(dataInicio, dataFim) {
  // Busca pedidos entregues no período
  const pedidos = await prisma.pedidoOmie.findMany({
    where: {
      dataEntregaReal: { not: null },
      status: { not: "ERRO" },
    },
    select: {
      id: true,
      numeroPedido: true,
      codigoPedido: true,
      fornecedorNome: true,
      prazoEntregaPrevisto: true,
      dataEntregaReal: true,
      total: true,
      itensOmie: true,
      cotacao: {
        select: {
          fornecedor: { select: { razaoSocial: true } },
          fornecedorNome: true,
        },
      },
      recebimentos: {
        select: { qtdRecebida: true },
      },
    },
  });

  let totalPedidos = 0;
  let onTime = 0;
  let inFull = 0;
  let otif = 0;
  const detalhe = [];

  for (const p of pedidos) {
    totalPedidos++;

    // On-Time: entrega real ≤ prazo combinado
    const isOnTime = p.prazoEntregaPrevisto
      ? new Date(p.dataEntregaReal) <= new Date(p.prazoEntregaPrevisto)
      : true; // sem prazo = considerado no prazo

    // In-Full: quantidade recebida ≥ quantidade pedida
    let isInFull = true;
    const itens = Array.isArray(p.itensOmie) ? p.itensOmie : [];
    if (itens.length > 0) {
      const qtdPedida = itens.reduce((s, it) => s + (it.qtd || 0), 0);
      const qtdRecebida = itens.reduce((s, it) => s + (it.qtdRecebida || 0), 0);
      isInFull = qtdPedida > 0 ? qtdRecebida >= qtdPedida * 0.98 : true; // 2% tolerância peso
    } else if (p.recebimentos.length > 0) {
      // Fallback: usa recebimentos
      // Se tem recebimento registrado, assume in-full (sem qtd pedida pra comparar)
      isInFull = true;
    }

    if (isOnTime) onTime++;
    if (isInFull) inFull++;
    if (isOnTime && isInFull) otif++;

    const fornecedor = p.cotacao?.fornecedor?.razaoSocial
      || p.cotacao?.fornecedorNome
      || p.fornecedorNome || "—";

    detalhe.push({
      pedidoId: p.id,
      numero: p.numeroPedido || p.codigoPedido || "—",
      fornecedor,
      prazo: p.prazoEntregaPrevisto,
      entrega: p.dataEntregaReal,
      isOnTime,
      isInFull,
      isOTIF: isOnTime && isInFull,
    });
  }

  const pctOTIF = totalPedidos > 0 ? (otif / totalPedidos) * 100 : 0;
  const pctOnTime = totalPedidos > 0 ? (onTime / totalPedidos) * 100 : 0;
  const pctInFull = totalPedidos > 0 ? (inFull / totalPedidos) * 100 : 0;

  return {
    resumo: {
      totalPedidos,
      otif,
      onTime,
      inFull,
      pctOTIF: Math.round(pctOTIF * 10) / 10,
      pctOnTime: Math.round(pctOnTime * 10) / 10,
      pctInFull: Math.round(pctInFull * 10) / 10,
      meta: 90, // meta de referência
    },
    detalhe: detalhe.sort((a, b) => new Date(b.entrega) - new Date(a.entrega)),
  };
}

// ─── ATENDIMENTO INTERNO ─────────────────────────────────────
// Mede a eficiência do departamento de Compras no pipeline:
//   RM criada → RFQ enviada → Fornecedor respondeu → Pedido gerado
// Foco: tempo entre resposta do fornecedor e geração do pedido.
async function calcularAtendimento(dataInicio, dataFim) {
  // 1) Cotações respondidas que geraram pedido — mede lead time de compra
  const cotacoesComPedido = await prisma.cotacao.findMany({
    where: {
      recebidaEm: { not: null },
      pedidosOmie: { some: { status: { not: "ERRO" } } },
    },
    select: {
      id: true,
      fornecedorNome: true,
      fornecedor: { select: { razaoSocial: true } },
      createdAt: true,
      recebidaEm: true,
      rm: {
        select: {
          id: true,
          numero: true,
          createdAt: true,
          op: { select: { numero: true } },
        },
      },
      pedidosOmie: {
        where: { status: { not: "ERRO" } },
        select: { id: true, numeroPedido: true, createdAt: true, total: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  // 2) Cotações respondidas PENDENTES — backlog (respondeu, mas não gerou pedido)
  const cotacoesPendentes = await prisma.cotacao.findMany({
    where: {
      recebidaEm: { not: null },
      status: "RECEBIDA",
      pedidosOmie: { none: {} },
      rm: { status: { notIn: ["CANCELADA", "PEDIDO_GERADO"] } },
    },
    select: {
      id: true,
      fornecedorNome: true,
      fornecedor: { select: { razaoSocial: true } },
      recebidaEm: true,
      total: true,
      rm: {
        select: {
          numero: true,
          createdAt: true,
          op: { select: { numero: true } },
        },
      },
    },
  });

  // ── Calcular lead times ──
  const agora = new Date();
  const detalheConcluido = [];
  const faixas = { ate3: 0, ate7: 0, ate15: 0, acima15: 0 };
  let somaLeadRespPedido = 0;   // dias úteis: resposta → pedido
  let somaLeadRmPedido = 0;     // dias úteis: RM criada → pedido
  let somaLeadRmRfq = 0;        // dias úteis: RM criada → RFQ enviada

  for (const cot of cotacoesComPedido) {
    const pedido = cot.pedidosOmie[0];
    if (!pedido) continue;

    const diasRespPedido = diasUteis(cot.recebidaEm, pedido.createdAt);
    const diasRmRfq = diasUteis(cot.rm.createdAt, cot.createdAt);
    const diasRmPedido = diasUteis(cot.rm.createdAt, pedido.createdAt);

    somaLeadRespPedido += diasRespPedido;
    somaLeadRmPedido += diasRmPedido;
    somaLeadRmRfq += diasRmRfq;

    if (diasRespPedido <= 3) faixas.ate3++;
    else if (diasRespPedido <= 7) faixas.ate7++;
    else if (diasRespPedido <= 15) faixas.ate15++;
    else faixas.acima15++;

    const fornecedor = cot.fornecedor?.razaoSocial || cot.fornecedorNome;

    detalheConcluido.push({
      cotacaoId: cot.id,
      rmNumero: cot.rm.numero,
      opNumero: cot.rm.op?.numero || "—",
      fornecedor,
      rmCriada: cot.rm.createdAt,
      rfqEnviada: cot.createdAt,
      respostaEm: cot.recebidaEm,
      pedidoEm: pedido.createdAt,
      pedidoNumero: pedido.numeroPedido || "—",
      diasRmRfq,
      diasRespPedido,
      diasRmPedido,
    });
  }

  const total = detalheConcluido.length;
  const mediaRespPedido = total > 0 ? Math.round((somaLeadRespPedido / total) * 10) / 10 : 0;
  const mediaRmPedido = total > 0 ? Math.round((somaLeadRmPedido / total) * 10) / 10 : 0;
  const mediaRmRfq = total > 0 ? Math.round((somaLeadRmRfq / total) * 10) / 10 : 0;

  // ── Backlog: cotações respondidas sem pedido ──
  const backlog = cotacoesPendentes.map((cot) => {
    const diasEsperando = diasUteis(cot.recebidaEm, agora);
    return {
      cotacaoId: cot.id,
      rmNumero: cot.rm.numero,
      opNumero: cot.rm.op?.numero || "—",
      fornecedor: cot.fornecedor?.razaoSocial || cot.fornecedorNome,
      respostaEm: cot.recebidaEm,
      diasEsperando,
      valorCotacao: cot.total,
    };
  }).sort((a, b) => b.diasEsperando - a.diasEsperando);

  // ── Pct dentro do alvo (≤ 5 dias úteis) ──
  const dentroAlvo = detalheConcluido.filter((d) => d.diasRespPedido <= 5).length;
  const pctDentroAlvo = total > 0 ? Math.round((dentroAlvo / total) * 1000) / 10 : 0;

  return {
    resumo: {
      totalProcessados: total,
      mediaRespPedido,     // dias úteis: fornecedor respondeu → pedido gerado
      mediaRmRfq,          // dias úteis: RM criada → RFQ enviada
      mediaRmPedido,       // dias úteis: RM criada → pedido gerado (pipeline total)
      pctDentroAlvo,       // % processados em ≤ 5 dias úteis
      alvo: 5,             // meta em dias úteis
      backlogQtd: backlog.length,
      backlogValor: backlog.reduce((s, b) => s + (b.valorCotacao || 0), 0),
    },
    faixas,
    detalhe: detalheConcluido.sort((a, b) => new Date(b.pedidoEm) - new Date(a.pedidoEm)),
    backlog,
  };
}

// ─── NOTA DO SETOR ───────────────────────────────────────────
// Calcula nota composta do setor Compras (0–100) com pesos por indicador.
// Cada indicador é normalizado pra escala 0–100 antes de ponderar.
function calcularNotaSetor({ otif, savings, atendimento, scorecard }) {
  const pesos = {
    otif: 0.30,
    savings: 0.20,
    atendimento: 0.25,
    scorecard: 0.25,
  };

  const indicadores = [];

  // OTIF: pctOTIF já é 0-100
  if (otif.resumo.totalPedidos > 0) {
    indicadores.push({
      id: "otif",
      label: "OTIF",
      peso: pesos.otif,
      nota: otif.resumo.pctOTIF,
      detalhe: `${otif.resumo.pctOTIF}% (${otif.resumo.otif}/${otif.resumo.totalPedidos})`,
    });
  }

  // Savings: normaliza pctSavings para 0-100.
  // 0% savings = 50, savings positivo sobe até 100, negativo desce até 0.
  // Fórmula: clamp(50 + pctSavings, 0, 100)
  if (savings.resumo.qtdObras > 0) {
    const notaSavings = Math.max(0, Math.min(100, 50 + savings.resumo.pctSavings));
    indicadores.push({
      id: "savings",
      label: "Savings",
      peso: pesos.savings,
      nota: Math.round(notaSavings * 10) / 10,
      detalhe: `${savings.resumo.pctSavings}% economia`,
    });
  }

  // Atendimento: pctDentroAlvo já é 0-100
  if (atendimento.resumo.totalProcessados > 0) {
    indicadores.push({
      id: "atendimento",
      label: "Atendimento",
      peso: pesos.atendimento,
      nota: atendimento.resumo.pctDentroAlvo,
      detalhe: `${atendimento.resumo.mediaRespPedido}d média, ${atendimento.resumo.pctDentroAlvo}% no alvo`,
    });
  }

  // Scorecard: média das notas finais dos fornecedores (já 0-100)
  const fornecedoresComNota = scorecard.fornecedores.filter((f) => f.notaFinal !== null);
  if (fornecedoresComNota.length > 0) {
    const media = fornecedoresComNota.reduce((s, f) => s + f.notaFinal, 0) / fornecedoresComNota.length;
    indicadores.push({
      id: "scorecard",
      label: "Fornecedores",
      peso: pesos.scorecard,
      nota: Math.round(media * 10) / 10,
      detalhe: `${media.toFixed(1)} média de ${fornecedoresComNota.length} fornecedor(es)`,
    });
  }

  // Nota final: média ponderada (rebalanceia pesos se algum indicador não tem dados)
  let notaFinal = null;
  if (indicadores.length > 0) {
    const pesoTotal = indicadores.reduce((s, i) => s + i.peso, 0);
    notaFinal = indicadores.reduce((s, i) => s + i.nota * i.peso, 0) / pesoTotal;
    notaFinal = Math.round(notaFinal * 10) / 10;
  }

  return {
    nota: notaFinal,
    indicadores,
    pesos,
  };
}

// ─── HELPERS ─────────────────────────────────────────────────

// Conta dias úteis entre duas datas (exclui sábado e domingo)
function diasUteis(de, ate) {
  const inicio = new Date(de);
  const fim = new Date(ate);
  if (fim <= inicio) return 0;
  let dias = 0;
  const cursor = new Date(inicio);
  cursor.setHours(0, 0, 0, 0);
  const alvo = new Date(fim);
  alvo.setHours(0, 0, 0, 0);
  while (cursor < alvo) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) dias++;
  }
  return dias;
}

// Adiciona N dias úteis a uma data (pula sábado e domingo)
function adicionarDiasUteis(data, dias) {
  const resultado = new Date(data);
  let adicionados = 0;
  while (adicionados < dias) {
    resultado.setDate(resultado.getDate() + 1);
    const dow = resultado.getDay();
    if (dow !== 0 && dow !== 6) adicionados++;
  }
  return resultado;
}
