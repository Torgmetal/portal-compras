import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/compras/indicadores/mensal?ano=YYYY
// Indicadores de Compras MES A MES + ACUMULADO (YTD) do ano.
//   - OTIF, Atendimento e Scorecard: recalculados por mes (fluxo do mes) e no
//     acumulado (jan -> mes atual).
//   - Savings: cumulativo por obra (nao e fluxo mensal) -> mostra gasto do mes
//     + o savings acumulado do ano.
//   - Nota do Setor: media ponderada por mes / acumulada.
// Busca os dados do ano UMA vez e agrupa em memoria (evita 12 queries pesadas
// e o OOM do Neon).
export const runtime = "nodejs";
export const maxDuration = 30;

const META = { otif: 90, atendimento: 5, savings: 0, nota: 80 };
const PESOS = { otif: 0.3, savings: 0.2, atendimento: 0.25, scorecard: 0.25 };

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);

    const { searchParams } = new URL(req.url);
    const anoParam = parseInt(searchParams.get("ano"), 10);
    const agora = new Date();
    const ano = anoParam >= 2020 && anoParam <= 2100 ? anoParam : agora.getFullYear();

    const jan1 = new Date(ano, 0, 1);
    const dez31 = new Date(ano, 11, 31, 23, 59, 59, 999);
    // Ultimo mes com dados: mes corrente (ano atual) ou dezembro (anos passados).
    const ultimoMes = ano === agora.getFullYear() ? agora.getMonth() + 1 : 12;

    // ── Busca do ano (uma vez cada) ──────────────────────────────
    const [pedidosEntregues, pedidosCriados, cotacoes, savingsYTD] = await Promise.all([
      // OTIF: pedidos entregues no ano (por dataEntregaReal)
      prisma.pedidoOmie.findMany({
        where: { dataEntregaReal: { gte: jan1, lte: dez31 }, status: { not: "ERRO" } },
        select: { prazoEntregaPrevisto: true, dataEntregaReal: true, itensOmie: true, recebimentos: { select: { qtdRecebida: true } } },
      }),
      // Gasto: pedidos criados no ano (por createdAt)
      prisma.pedidoOmie.findMany({
        where: { createdAt: { gte: jan1, lte: dez31 }, status: { not: "ERRO" } },
        select: { createdAt: true, total: true },
      }),
      // Scorecard + Atendimento: cotacoes criadas no ano
      prisma.cotacao.findMany({
        where: { createdAt: { gte: jan1, lte: dez31 } },
        select: {
          fornecedorId: true, createdAt: true, recebidaEm: true, prazoResposta: true, status: true,
          itens: { select: { rmItemId: true, precoUnit: true } },
          pedidosOmie: { where: { status: { not: "ERRO" } }, select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
        },
      }),
      calcularSavingsAcumulado(),
    ]);

    // ── Series mensais + acumulado ───────────────────────────────
    const meses = [];
    for (let m = 1; m <= ultimoMes; m++) {
      const pedM = pedidosEntregues.filter((p) => new Date(p.dataEntregaReal).getMonth() + 1 === m);
      const gastoM = pedidosCriados.filter((p) => new Date(p.createdAt).getMonth() + 1 === m).reduce((s, p) => s + (p.total || 0), 0);
      const cotsM = cotacoes.filter((c) => new Date(c.createdAt).getMonth() + 1 === m);

      const otif = computeOTIF(pedM);
      const atend = computeAtendimento(cotsM);
      const score = computeScorecard(cotsM);
      const nota = computeNota({ otif, atend, score, savingsPct: null });

      meses.push({ mes: m, otif, atendimento: atend, scorecard: score, gastoMes: Math.round(gastoM), nota });
    }

    // Acumulado (YTD): recalcula sobre TODO o periodo jan -> mes atual (nao e
    // media dos meses — e o indicador real do periodo).
    const otifAc = computeOTIF(pedidosEntregues);
    const atendAc = computeAtendimento(cotacoes);
    const scoreAc = computeScorecard(cotacoes);
    const notaAc = computeNota({ otif: otifAc, atend: atendAc, score: scoreAc, savingsPct: savingsYTD.pctSavings });

    return NextResponse.json({
      success: true,
      ano,
      ultimoMes,
      metas: META,
      pesos: PESOS,
      meses,
      acumulado: {
        otif: otifAc,
        atendimento: atendAc,
        scorecard: scoreAc,
        savings: savingsYTD,
        gastoAno: Math.round(pedidosCriados.reduce((s, p) => s + (p.total || 0), 0)),
        nota: notaAc,
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── OTIF de um conjunto de pedidos entregues ───────────────────
function computeOTIF(pedidos) {
  let total = 0, onTime = 0, inFull = 0, otif = 0;
  for (const p of pedidos) {
    total++;
    const isOnTime = p.prazoEntregaPrevisto ? new Date(p.dataEntregaReal) <= new Date(p.prazoEntregaPrevisto) : true;
    let isInFull = true;
    const itens = Array.isArray(p.itensOmie) ? p.itensOmie : [];
    if (itens.length > 0) {
      const qp = itens.reduce((s, it) => s + (it.qtd || 0), 0);
      const qr = itens.reduce((s, it) => s + (it.qtdRecebida || 0), 0);
      isInFull = qp > 0 ? qr >= qp * 0.98 : true;
    }
    if (isOnTime) onTime++;
    if (isInFull) inFull++;
    if (isOnTime && isInFull) otif++;
  }
  return {
    total,
    pct: total > 0 ? Math.round((otif / total) * 1000) / 10 : null,
    pctOnTime: total > 0 ? Math.round((onTime / total) * 1000) / 10 : null,
    pctInFull: total > 0 ? Math.round((inFull / total) * 1000) / 10 : null,
  };
}

// ── Atendimento (lead time resposta -> pedido) ─────────────────
function computeAtendimento(cotacoes) {
  let soma = 0, total = 0, noAlvo = 0;
  for (const c of cotacoes) {
    const ped = c.pedidosOmie?.[0];
    if (!c.recebidaEm || !ped) continue;
    const dias = diasUteis(c.recebidaEm, ped.createdAt);
    soma += dias; total++;
    if (dias <= META.atendimento) noAlvo++;
  }
  return {
    total,
    mediaDias: total > 0 ? Math.round((soma / total) * 10) / 10 : null,
    pctAlvo: total > 0 ? Math.round((noAlvo / total) * 1000) / 10 : null,
  };
}

// ── Scorecard: nota media dos fornecedores no periodo ──────────
// Reusa a logica do endpoint principal: prazo de resposta + preco relativo.
// (Entrega/qualidade dependem de pedido entregue; aqui foca no que existe no
// mes de cotacao — resposta e competitividade de preco.)
function computeScorecard(cotacoes) {
  // Ranking de preco por rmItem dentro do periodo
  const precoPorItem = new Map();
  for (const c of cotacoes) {
    for (const it of c.itens || []) {
      if (it.precoUnit == null) continue;
      if (!precoPorItem.has(it.rmItemId)) precoPorItem.set(it.rmItemId, []);
      precoPorItem.get(it.rmItemId).push({ fornecedorId: c.fornecedorId, precoUnit: it.precoUnit });
    }
  }
  const porForn = new Map();
  for (const c of cotacoes) {
    if (!c.fornecedorId) continue;
    if (!porForn.has(c.fornecedorId)) porForn.set(c.fornecedorId, []);
    porForn.get(c.fornecedorId).push(c);
  }
  const notas = [];
  for (const [fId, cots] of porForn) {
    // Resposta no prazo
    const respondidas = cots.filter((c) => c.recebidaEm).length;
    let noPrazo = 0;
    for (const c of cots) {
      if (!c.recebidaEm) continue;
      const limite = c.prazoResposta || adicionarDiasUteis(c.createdAt, 3);
      if (new Date(c.recebidaEm) <= new Date(limite)) noPrazo++;
    }
    const notaResp = respondidas > 0 ? (noPrazo / respondidas) * 100 : null;
    // Preco relativo
    let somaPreco = 0, nPreco = 0;
    for (const c of cots) {
      for (const it of c.itens || []) {
        const conc = precoPorItem.get(it.rmItemId) || [];
        if (conc.length < 2) continue;
        const ord = [...conc].sort((a, b) => a.precoUnit - b.precoUnit);
        const pos = ord.findIndex((x) => x.fornecedorId === fId) + 1;
        const score = ord.length > 1 ? ((ord.length - pos) / (ord.length - 1)) * 100 : 100;
        somaPreco += score; nPreco++;
      }
    }
    const notaPreco = nPreco > 0 ? somaPreco / nPreco : null;
    const crit = [{ nota: notaResp, peso: 0.5 }, { nota: notaPreco, peso: 0.5 }].filter((x) => x.nota !== null);
    if (crit.length === 0) continue;
    const pesoT = crit.reduce((s, x) => s + x.peso, 0);
    notas.push(crit.reduce((s, x) => s + x.nota * x.peso, 0) / pesoT);
  }
  const nota = notas.length > 0 ? notas.reduce((s, n) => s + n, 0) / notas.length : null;
  return { nota: nota !== null ? Math.round(nota * 10) / 10 : null, nFornecedores: notas.length };
}

// ── Nota do setor (media ponderada; rebalanceia se faltar dado) ─
function computeNota({ otif, atend, score, savingsPct }) {
  const ind = [];
  if (otif.total > 0) ind.push({ peso: PESOS.otif, nota: otif.pct });
  if (savingsPct != null) ind.push({ peso: PESOS.savings, nota: Math.max(0, Math.min(100, 50 + savingsPct)) });
  if (atend.total > 0) ind.push({ peso: PESOS.atendimento, nota: atend.pctAlvo });
  if (score.nota != null) ind.push({ peso: PESOS.scorecard, nota: score.nota });
  if (ind.length === 0) return null;
  const pesoT = ind.reduce((s, i) => s + i.peso, 0);
  return Math.round((ind.reduce((s, i) => s + i.nota * i.peso, 0) / pesoT) * 10) / 10;
}

// ── Savings acumulado (cumulativo por obra — mesma logica do endpoint) ──
async function calcularSavingsAcumulado() {
  const ops = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ENCERRADA"] } },
    select: {
      itens: { select: { valorVerba: true, faturamentoDireto: true } },
      aditivos: { select: { itens: { select: { valorVerba: true, faturamentoDireto: true } } } },
      pedidosOmieAvulsos: { where: { status: { not: "ERRO" } }, select: { total: true } },
      rms: { select: { cotacoes: { select: { pedidosOmie: { where: { status: { not: "ERRO" } }, select: { id: true, total: true } } } } } },
    },
  });
  let totalVerba = 0, totalGasto = 0, qtdObras = 0;
  for (const op of ops) {
    const verba = [...op.itens, ...op.aditivos.flatMap((a) => a.itens)]
      .filter((it) => !it.faturamentoDireto)
      .reduce((s, it) => s + (it.valorVerba || 0), 0);
    if (verba <= 0) continue;
    const vistos = new Set();
    let gasto = 0;
    for (const rm of op.rms) for (const cot of rm.cotacoes) for (const ped of cot.pedidosOmie) {
      if (!vistos.has(ped.id)) { vistos.add(ped.id); gasto += ped.total || 0; }
    }
    for (const ped of op.pedidosOmieAvulsos) gasto += ped.total || 0;
    totalVerba += verba; totalGasto += gasto; qtdObras++;
  }
  const savingsR$ = totalVerba - totalGasto;
  return {
    totalVerba: Math.round(totalVerba),
    totalGasto: Math.round(totalGasto),
    savingsR$: Math.round(savingsR$),
    pctSavings: totalVerba > 0 ? Math.round((savingsR$ / totalVerba) * 1000) / 10 : 0,
    qtdObras,
  };
}

// ── Helpers de dias uteis (iguais ao endpoint principal) ───────
function diasUteis(de, ate) {
  const inicio = new Date(de), fim = new Date(ate);
  if (fim <= inicio) return 0;
  let dias = 0;
  const cur = new Date(inicio); cur.setHours(0, 0, 0, 0);
  const alvo = new Date(fim); alvo.setHours(0, 0, 0, 0);
  while (cur < alvo) { cur.setDate(cur.getDate() + 1); const d = cur.getDay(); if (d !== 0 && d !== 6) dias++; }
  return dias;
}
function adicionarDiasUteis(data, dias) {
  const r = new Date(data); let a = 0;
  while (a < dias) { r.setDate(r.getDate() + 1); const d = r.getDay(); if (d !== 0 && d !== 6) a++; }
  return r;
}
