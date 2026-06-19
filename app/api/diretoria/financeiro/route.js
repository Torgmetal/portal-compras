// GET /api/diretoria/financeiro — visão executiva consolidada (módulo Diretoria).
// Contas a pagar, a receber, posição líquida e previsão de receita por entregas.
// Gate próprio (requireDiretoria) — nem ADMIN entra sem estar liberado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const maxDuration = 30;

// Agrupa títulos em total / vencido / a vencer (30d) por saldo.
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
  const r = (n) => Math.round(n * 100) / 100;
  return { total: r(total), vencido: r(vencido), aVencer30: r(aVencer30), qtd };
}

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
      select: { valor: true, valorPago: true, dataVencimento: true },
    }),
    prisma.contaReceber.findMany({
      where: { saldo: { gt: 0 }, status: { not: "CANCELADO" } },
      select: { saldo: true, dataVencimento: true },
    }),
    prisma.oP.findMany({
      where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] }, valorTotalContrato: { gt: 0 } },
      select: { id: true, numero: true, cliente: true, obra: true, valorTotalContrato: true, status: true },
    }),
    prisma.omieSyncState.findUnique({ where: { id: "contapagar" }, select: { ultimoSync: true } }),
    prisma.omieSyncState.findUnique({ where: { id: "contareceber" }, select: { ultimoSync: true } }),
  ]);

  const aPagar = balde(pagarRaw.map((c) => ({ saldo: Math.max(0, (c.valor || 0) - (c.valorPago || 0)), venc: c.dataVencimento })), hoje, em30);
  const aReceber = balde(recRaw.map((c) => ({ saldo: c.saldo || 0, venc: c.dataVencimento })), hoje, em30);
  const posicao = Math.round((aReceber.total - aPagar.total) * 100) / 100;

  // Previsão de receita por entregas: contrato das OPs ativas × (1 − % já entregue
  // por peso). É uma ESTIMATIVA (o que ainda falta entregar/faturar da carteira).
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
      const tot = totMap.get(o.id) || 0;
      const exp = expMap.get(o.id) || 0;
      const pct = tot > 0 ? exp / tot : 0;
      const contrato = o.valorTotalContrato || 0;
      return {
        numero: o.numero,
        cliente: o.cliente,
        obra: o.obra,
        status: o.status,
        contrato,
        pctEntregue: Math.round(pct * 100),
        aFaturar: Math.round(contrato * (1 - pct) * 100) / 100,
      };
    })
    .sort((a, b) => b.aFaturar - a.aFaturar);

  const previsao = {
    totalContrato: Math.round(ops.reduce((s, o) => s + (o.valorTotalContrato || 0), 0) * 100) / 100,
    aFaturar: Math.round(opsForecast.reduce((s, o) => s + o.aFaturar, 0) * 100) / 100,
    qtdObras: ops.length,
    ops: opsForecast.slice(0, 25),
  };

  return NextResponse.json({
    aPagar,
    aReceber,
    posicao,
    previsao,
    sync: { pagar: syncPg?.ultimoSync || null, receber: syncRc?.ultimoSync || null },
  });
}
