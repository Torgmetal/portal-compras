// GET /api/comercial/indicadores?ano=2026
// Calcula os 5 indicadores do comercial:
//   1. Win Rate   2. Margem Bruta   3. Tempo Resposta RFQ
//   4. Pipeline Ponderado   5. Concentração de Clientes
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ROLES = ["ADMIN", "COMERCIAL"];

// Probabilidade de fechamento por etapa do funil (parametro ajustavel)
const PROB_ETAPA = {
  ORCAMENTO: 0.3,
  EM_NEGOCIACAO: 0.6,
};

export async function GET(req) {
  try {
    await requireRole(ROLES);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") || new Date().getFullYear());
  const inicioAno = new Date(ano, 0, 1);
  const fimAno = new Date(ano, 11, 31, 23, 59, 59, 999);

  // ─── BUSCA ORCAMENTOS DO ANO ────────────────────────────────
  const orcamentos = await prisma.orcamento.findMany({
    where: {
      dataSolicitada: { gte: inicioAno, lte: fimAno },
    },
    include: {
      op: { select: { id: true, numero: true } },
    },
    orderBy: { dataSolicitada: "asc" },
  });

  // ─── 1. WIN RATE ────────────────────────────────────────────
  // Apenas propostas com desfecho (FECHADA ou PERDIDA)
  const comDesfecho = orcamentos.filter(
    (o) => o.status === "FECHADA" || o.status === "PERDIDA"
  );
  const ganhas = comDesfecho.filter((o) => o.status === "FECHADA");
  const perdidas = comDesfecho.filter((o) => o.status === "PERDIDA");

  const winRatePct =
    comDesfecho.length > 0
      ? (ganhas.length / comDesfecho.length) * 100
      : 0;

  // Win Rate por tipo de venda
  const wrPorTipo = {};
  comDesfecho.forEach((o) => {
    const t = o.tipoVenda || "SEM_TIPO";
    if (!wrPorTipo[t]) wrPorTipo[t] = { ganhas: 0, total: 0, valorGanho: 0 };
    wrPorTipo[t].total += 1;
    if (o.status === "FECHADA") {
      wrPorTipo[t].ganhas += 1;
      wrPorTipo[t].valorGanho += o.valor || 0;
    }
  });

  // Win Rate por porte
  const wrPorPorte = {};
  comDesfecho.forEach((o) => {
    const p = o.porte || "SEM_PORTE";
    if (!wrPorPorte[p]) wrPorPorte[p] = { ganhas: 0, total: 0, valorGanho: 0 };
    wrPorPorte[p].total += 1;
    if (o.status === "FECHADA") {
      wrPorPorte[p].ganhas += 1;
      wrPorPorte[p].valorGanho += o.valor || 0;
    }
  });

  // Motivos de perda
  const motivos = {};
  perdidas.forEach((o) => {
    const m = (o.motivoPerda || "Nao informado").trim();
    motivos[m] = (motivos[m] || 0) + 1;
  });
  const motivosRank = Object.entries(motivos)
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const winRate = {
    totalComDesfecho: comDesfecho.length,
    ganhas: ganhas.length,
    perdidas: perdidas.length,
    taxa: Math.round(winRatePct * 10) / 10,
    valorGanho: ganhas.reduce((s, o) => s + (o.valor || 0), 0),
    valorPerdido: perdidas.reduce((s, o) => s + (o.valor || 0), 0),
    porTipo: Object.entries(wrPorTipo).map(([tipo, d]) => ({
      tipo,
      ...d,
      taxa: d.total > 0 ? Math.round((d.ganhas / d.total) * 1000) / 10 : 0,
    })),
    porPorte: Object.entries(wrPorPorte).map(([porte, d]) => ({
      porte,
      ...d,
      taxa: d.total > 0 ? Math.round((d.ganhas / d.total) * 1000) / 10 : 0,
    })),
    motivosPerda: motivosRank,
  };

  // ─── 2. MARGEM BRUTA POR CONTRATO ──────────────────────────
  // Busca OPs com valor de contrato e custos (verba)
  const opsIds = ganhas.filter((o) => o.opId).map((o) => o.opId);
  let margemContratos = [];
  let margemMedia = 0;

  if (opsIds.length > 0) {
    const ops = await prisma.oP.findMany({
      where: { id: { in: opsIds } },
      select: {
        id: true,
        numero: true,
        cliente: true,
        valorTotalContrato: true,
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
        receitas: {
          select: {
            valor: true,
            icmsPct: true,
            ipiPct: true,
            pisPct: true,
            cofinsPct: true,
            issPct: true,
            irrfPct: true,
            csllPct: true,
          },
        },
      },
    });

    margemContratos = ops.map((op) => {
      // Receita bruta
      const receitaBruta = op.receitas.reduce((s, r) => s + (r.valor || 0), 0);

      // Impostos
      const totalImpostos = op.receitas.reduce((s, r) => {
        const v = r.valor || 0;
        return s +
          v * ((r.icmsPct || 0) / 100) +
          v * ((r.pisPct || 0) / 100) +
          v * ((r.cofinsPct || 0) / 100) +
          v * ((r.issPct || 0) / 100) +
          v * ((r.irrfPct || 0) / 100) +
          v * ((r.csllPct || 0) / 100);
      }, 0);

      // Verba Torg (custo direto, excluindo faturamento direto)
      const verbaTorg =
        op.itens
          .filter((i) => !i.faturamentoDireto)
          .reduce((s, i) => s + (i.valorVerba || 0), 0) +
        op.aditivos.reduce(
          (s, a) =>
            s +
            a.itens
              .filter((i) => !i.faturamentoDireto)
              .reduce((si, i) => si + (i.valorVerba || 0), 0),
          0
        );

      // Verba FD
      const verbaFD =
        op.itens
          .filter((i) => i.faturamentoDireto)
          .reduce((s, i) => s + (i.valorVerba || 0), 0) +
        op.aditivos.reduce(
          (s, a) =>
            s +
            a.itens
              .filter((i) => i.faturamentoDireto)
              .reduce((si, i) => si + (i.valorVerba || 0), 0),
          0
        );

      const valorContrato = op.valorTotalContrato || receitaBruta + verbaFD || 0;
      const margemR = valorContrato - totalImpostos - verbaTorg;
      const margemPct = valorContrato > 0 ? (margemR / valorContrato) * 100 : 0;

      return {
        opId: op.id,
        opNumero: op.numero,
        cliente: op.cliente,
        valorContrato: Math.round(valorContrato * 100) / 100,
        custoTorg: Math.round(verbaTorg * 100) / 100,
        impostos: Math.round(totalImpostos * 100) / 100,
        margemR: Math.round(margemR * 100) / 100,
        margemPct: Math.round(margemPct * 10) / 10,
      };
    });

    // Ordena por margem % (menor primeiro pra destaque negativo)
    margemContratos.sort((a, b) => a.margemPct - b.margemPct);

    const somaMargem = margemContratos.reduce((s, c) => s + c.margemPct, 0);
    margemMedia =
      margemContratos.length > 0
        ? Math.round((somaMargem / margemContratos.length) * 10) / 10
        : 0;
  }

  const margem = {
    media: margemMedia,
    contratos: margemContratos,
    totalContratos: margemContratos.length,
    semOP: ganhas.filter((o) => !o.opId).length,
  };

  // ─── 3. TEMPO DE RESPOSTA À RFQ ───────────────────────────
  const PRAZO_ALVO_DIAS = 7; // parametro: 7 dias uteis
  const comResposta = orcamentos.filter(
    (o) => o.dataSolicitada && o.dataEnvio
  );

  const tempos = comResposta.map((o) => {
    const d1 = new Date(o.dataSolicitada);
    const d2 = new Date(o.dataEnvio);
    const dias = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    return {
      numero: o.numero,
      cliente: o.cliente,
      dias: Math.max(dias, 0),
      dentroPrazo: dias <= PRAZO_ALVO_DIAS,
    };
  });

  const tempoMedio =
    tempos.length > 0
      ? Math.round(
          (tempos.reduce((s, t) => s + t.dias, 0) / tempos.length) * 10
        ) / 10
      : 0;
  const dentroPrazoPct =
    tempos.length > 0
      ? Math.round(
          (tempos.filter((t) => t.dentroPrazo).length / tempos.length) * 1000
        ) / 10
      : 0;

  // Distribuicao por faixa de dias
  const faixas = [
    { label: "Ate 3 dias", min: 0, max: 3, count: 0 },
    { label: "4-7 dias", min: 4, max: 7, count: 0 },
    { label: "8-14 dias", min: 8, max: 14, count: 0 },
    { label: "15-30 dias", min: 15, max: 30, count: 0 },
    { label: "30+ dias", min: 31, max: 9999, count: 0 },
  ];
  tempos.forEach((t) => {
    const f = faixas.find((f) => t.dias >= f.min && t.dias <= f.max);
    if (f) f.count += 1;
  });

  const tempoResposta = {
    media: tempoMedio,
    dentroPrazoPct,
    prazoAlvo: PRAZO_ALVO_DIAS,
    totalComResposta: tempos.length,
    totalSemResposta: orcamentos.filter(
      (o) => o.dataSolicitada && !o.dataEnvio && o.status !== "PERDIDA"
    ).length,
    distribuicao: faixas,
  };

  // ─── 4. PIPELINE PONDERADO ─────────────────────────────────
  // Propostas em aberto no momento (independente do ano de solicitacao)
  const emAberto = await prisma.orcamento.findMany({
    where: {
      status: { in: ["ORCAMENTO", "EM_NEGOCIACAO"] },
    },
    select: {
      id: true,
      numero: true,
      cliente: true,
      obra: true,
      valor: true,
      status: true,
      vendedor: true,
      dataSolicitada: true,
      prazoEntrega: true,
    },
    orderBy: { dataSolicitada: "desc" },
  });

  const pipelineBruto = emAberto.reduce((s, o) => s + (o.valor || 0), 0);
  const pipelinePonderado = emAberto.reduce((s, o) => {
    const prob = PROB_ETAPA[o.status] || 0;
    return s + (o.valor || 0) * prob;
  }, 0);

  const porEtapa = {};
  emAberto.forEach((o) => {
    const st = o.status;
    if (!porEtapa[st])
      porEtapa[st] = { count: 0, valorBruto: 0, valorPonderado: 0 };
    porEtapa[st].count += 1;
    porEtapa[st].valorBruto += o.valor || 0;
    porEtapa[st].valorPonderado += (o.valor || 0) * (PROB_ETAPA[st] || 0);
  });

  const pipeline = {
    bruto: Math.round(pipelineBruto * 100) / 100,
    ponderado: Math.round(pipelinePonderado * 100) / 100,
    totalPropostas: emAberto.length,
    porEtapa: Object.entries(porEtapa).map(([status, d]) => ({
      status,
      probabilidade: (PROB_ETAPA[status] || 0) * 100,
      ...d,
    })),
    propostas: emAberto.map((o) => ({
      numero: o.numero,
      cliente: o.cliente,
      obra: o.obra,
      valor: o.valor || 0,
      status: o.status,
      vendedor: o.vendedor,
      ponderado:
        Math.round((o.valor || 0) * (PROB_ETAPA[o.status] || 0) * 100) / 100,
    })),
  };

  // ─── 5. CONCENTRAÇÃO DE CLIENTES ───────────────────────────
  // Usa orcamentos FECHADOS do ano (receita = valor da proposta)
  const receitaPorCliente = {};
  ganhas.forEach((o) => {
    const cli = (o.cliente || "Desconhecido").trim();
    receitaPorCliente[cli] = (receitaPorCliente[cli] || 0) + (o.valor || 0);
  });

  const receitaTotal = Object.values(receitaPorCliente).reduce(
    (s, v) => s + v,
    0
  );
  const ranking = Object.entries(receitaPorCliente)
    .map(([cliente, receita]) => ({
      cliente,
      receita,
      pct:
        receitaTotal > 0
          ? Math.round((receita / receitaTotal) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.receita - a.receita);

  // Concentracao top N
  const topN = (n) => {
    const soma = ranking.slice(0, n).reduce((s, c) => s + c.receita, 0);
    return receitaTotal > 0
      ? Math.round((soma / receitaTotal) * 1000) / 10
      : 0;
  };

  const concentracao = {
    receitaTotal,
    totalClientes: ranking.length,
    top1: topN(1),
    top3: topN(3),
    top5: topN(5),
    ranking: ranking.slice(0, 10),
    alerta:
      ranking.length > 0 && ranking[0].pct > 30
        ? `${ranking[0].cliente} concentra ${ranking[0].pct}% da receita`
        : null,
  };

  // ─── EVOLUÇÃO MENSAL (bônus) ───────────────────────────────
  const porMes = Array.from({ length: 12 }, (_, i) => {
    const mesOrc = orcamentos.filter(
      (o) => new Date(o.dataSolicitada).getMonth() === i
    );
    const mesFechado = mesOrc.filter((o) => o.status === "FECHADA");
    const mesPerdido = mesOrc.filter((o) => o.status === "PERDIDA");
    return {
      mes: i,
      total: mesOrc.length,
      valorTotal: mesOrc.reduce((s, o) => s + (o.valor || 0), 0),
      fechadas: mesFechado.length,
      valorFechado: mesFechado.reduce((s, o) => s + (o.valor || 0), 0),
      perdidas: mesPerdido.length,
    };
  });

  return NextResponse.json({
    success: true,
    ano,
    resumo: {
      totalPropostas: orcamentos.length,
      valorTotal: orcamentos.reduce((s, o) => s + (o.valor || 0), 0),
    },
    winRate,
    margem,
    tempoResposta,
    pipeline,
    concentracao,
    evolucaoMensal: porMes,
  });
}
