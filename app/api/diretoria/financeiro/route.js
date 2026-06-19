// GET /api/diretoria/financeiro — visão executiva consolidada (módulo Diretoria).
// Resumo (a pagar/receber, posição, previsão por entregas) + ANÁLISE DE RUPTURA
// (gap de caixa por janela, vencidos, concentração de credores, leitura crítica).
// Gate próprio (requireDiretoria) — nem ADMIN entra sem estar liberado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const maxDuration = 30;

const r2 = (n) => Math.round((n || 0) * 100) / 100;

function balde(items, hoje, em30) {
  let total = 0, vencido = 0, aVencer30 = 0, qtd = 0;
  for (const it of items) {
    const s = it.saldo || 0;
    if (s <= 0.005) continue;
    total += s; qtd++;
    const v = it.venc ? new Date(it.venc) : null;
    if (v && v < hoje) vencido += s;
    else if (v && v <= em30) aVencer30 += s;
  }
  return { total: r2(total), vencido: r2(vencido), aVencer30: r2(aVencer30), qtd };
}
const acumAte = (items, lim) => r2(items.filter((i) => i.venc && new Date(i.venc) <= lim).reduce((s, i) => s + (i.saldo || 0), 0));
const fmtR$ = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function GET() {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const hoje = new Date(hojeIso + "T00:00:00.000Z");
  const em30 = new Date(hoje.getTime() + 30 * 86400000);

  const [pagarRaw, recRaw, ops, syncPg, syncRc] = await Promise.all([
    prisma.contaPagar.findMany({
      where: { status: { notIn: ["PAGO", "CANCELADO", "LIQUIDADO"] } },
      select: { valor: true, valorPago: true, dataVencimento: true, fornecedorNome: true, numeroDocumento: true },
    }),
    prisma.contaReceber.findMany({
      where: { saldo: { gt: 0 }, status: { not: "CANCELADO" } },
      select: { saldo: true, dataVencimento: true, clienteNome: true, numeroDocumento: true },
    }),
    prisma.oP.findMany({
      where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] }, valorTotalContrato: { gt: 0 } },
      select: { id: true, numero: true, cliente: true, obra: true, valorTotalContrato: true, status: true },
    }),
    prisma.omieSyncState.findUnique({ where: { id: "contapagar" }, select: { ultimoSync: true } }),
    prisma.omieSyncState.findUnique({ where: { id: "contareceber" }, select: { ultimoSync: true } }),
  ]);

  const pagarItems = pagarRaw.map((c) => ({ saldo: Math.max(0, (c.valor || 0) - (c.valorPago || 0)), venc: c.dataVencimento, nome: c.fornecedorNome || "—", doc: c.numeroDocumento }));
  const recItems = recRaw.map((c) => ({ saldo: c.saldo || 0, venc: c.dataVencimento, nome: c.clienteNome || "—", doc: c.numeroDocumento }));

  const aPagar = balde(pagarItems, hoje, em30);
  const aReceber = balde(recItems, hoje, em30);
  const posicao = r2(aReceber.total - aPagar.total);

  // ── Previsão de receita por entregas ──
  const opIds = ops.map((o) => o.id);
  const [totG, expG] = opIds.length
    ? await Promise.all([
        prisma.pecaConjunto.groupBy({ by: ["opId"], where: { opId: { in: opIds }, fonte: "LPC_IMPORT" }, _sum: { pesoTotalKg: true } }),
        prisma.pecaConjunto.groupBy({ by: ["opId"], where: { opId: { in: opIds }, fonte: "LPC_IMPORT", status: "EXPEDIDO" }, _sum: { pesoTotalKg: true } }),
      ])
    : [[], []];
  const totMap = new Map(totG.map((g) => [g.opId, g._sum.pesoTotalKg || 0]));
  const expMap = new Map(expG.map((g) => [g.opId, g._sum.pesoTotalKg || 0]));
  const opsForecast = ops
    .map((o) => {
      const tot = totMap.get(o.id) || 0, exp = expMap.get(o.id) || 0;
      const pct = tot > 0 ? exp / tot : 0;
      const contrato = o.valorTotalContrato || 0;
      return { numero: o.numero, cliente: o.cliente, obra: o.obra, status: o.status, contrato, pctEntregue: Math.round(pct * 100), aFaturar: r2(contrato * (1 - pct)) };
    })
    .sort((a, b) => b.aFaturar - a.aFaturar);
  const previsao = {
    totalContrato: r2(ops.reduce((s, o) => s + (o.valorTotalContrato || 0), 0)),
    aFaturar: r2(opsForecast.reduce((s, o) => s + o.aFaturar, 0)),
    qtdObras: ops.length,
    ops: opsForecast.slice(0, 25),
  };

  // ── ANÁLISE DE RUPTURA ──
  // Gap de caixa por janela: acumulado a pagar vs a receber até cada horizonte
  // (inclui vencidos). gap negativo = falta caixa (ruptura) assumindo recebimento no prazo.
  const janelas = [7, 15, 30, 60].map((dias) => {
    const lim = new Date(hoje.getTime() + dias * 86400000);
    const pagar = acumAte(pagarItems, lim);
    const receber = acumAte(recItems, lim);
    return { dias, pagar, receber, gap: r2(receber - pagar) };
  });

  // Concentração: maiores credores em aberto
  const porCredor = new Map();
  for (const it of pagarItems) { if (it.saldo <= 0.005) continue; porCredor.set(it.nome, (porCredor.get(it.nome) || 0) + it.saldo); }
  const topCredores = [...porCredor.entries()].map(([nome, v]) => ({ nome, valor: r2(v), pct: aPagar.total > 0 ? Math.round((v / aPagar.total) * 100) : 0 })).sort((a, b) => b.valor - a.valor).slice(0, 8);

  // Maiores títulos a pagar vencendo nos próximos 30 dias (inclui vencidos)
  const topTitulosPagar = pagarItems
    .filter((i) => i.saldo > 0.005 && i.venc && new Date(i.venc) <= em30)
    .sort((a, b) => b.saldo - a.saldo).slice(0, 10)
    .map((i) => ({ nome: i.nome, doc: i.doc, venc: i.venc, valor: r2(i.saldo), vencido: new Date(i.venc) < hoje }));

  const cobertura = aPagar.total > 0 ? Math.round((aReceber.total / aPagar.total) * 100) : null;

  // Leitura crítica (flags priorizadas por severidade)
  const flags = [];
  const gap30 = janelas.find((j) => j.dias === 30);
  if (gap30 && gap30.gap < 0)
    flags.push({ sev: "alta", texto: `Déficit projetado de ${fmtR$(Math.abs(gap30.gap))} em 30 dias — a pagar ${fmtR$(gap30.pagar)} contra ${fmtR$(gap30.receber)} a receber.` });
  if (aPagar.vencido > 0)
    flags.push({ sev: "alta", texto: `${fmtR$(aPagar.vencido)} já vencido a pagar — risco de corte de fornecedor, protesto e juros.` });
  if (cobertura != null && cobertura < 100)
    flags.push({ sev: cobertura < 30 ? "alta" : "media", texto: `Cobertura de ${cobertura}%: o a receber em aberto cobre só ${cobertura}% do a pagar em aberto.` });
  if (aReceber.vencido > 0)
    flags.push({ sev: "media", texto: `${fmtR$(aReceber.vencido)} a receber já vencido — caixa preso, priorizar cobrança.` });
  if (topCredores[0] && topCredores[0].pct >= 20)
    flags.push({ sev: "media", texto: `Concentração: ${topCredores[0].nome} representa ${topCredores[0].pct}% do a pagar (${fmtR$(topCredores[0].valor)}).` });
  const g7 = janelas.find((j) => j.dias === 7);
  if (g7 && g7.gap < 0)
    flags.push({ sev: "alta", texto: `Curtíssimo prazo: faltam ${fmtR$(Math.abs(g7.gap))} para os compromissos dos próximos 7 dias.` });

  return NextResponse.json({
    aPagar, aReceber, posicao, previsao,
    ruptura: { janelas, topCredores, topTitulosPagar, cobertura, flags },
    sync: { pagar: syncPg?.ultimoSync || null, receber: syncRc?.ultimoSync || null },
  });
}
