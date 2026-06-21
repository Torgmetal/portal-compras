// GET /api/diretoria/financeiro — visão executiva consolidada (módulo Diretoria).
// Resumo (a pagar/receber, posição, previsão por entregas) + ANÁLISE DE RUPTURA
// (gap de caixa por janela, vencidos, concentração de credores, leitura crítica).
// Gate próprio (requireDiretoria) — nem ADMIN entra sem estar liberado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";
import { calcularPrevisaoFaturamento } from "@/lib/previsao-faturamento";

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

// Natureza do gasto (a pagar): separa dívida/financiamento e investimento do
// custeio operacional, pra avaliar o pico de caixa sem o que pode ser rolado.
function classificarNatureza(nome) {
  const n = (nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/emprestimo|financiamento|juros|encargos|parcelamento|consorcio|leasing|banc/.test(n)) return "FINANCEIRO";
  if (/maquina|equipamento|investimento|imobilizado|benfeitoria|obras em andamento/.test(n)) return "INVESTIMENTO";
  return "OPERACIONAL";
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

  const [pagarRaw, recRaw, prev, syncPg, syncRc, cfgSaldo] = await Promise.all([
    prisma.contaPagar.findMany({
      where: { status: { notIn: ["PAGO", "CANCELADO", "LIQUIDADO"] } },
      select: { valor: true, valorPago: true, dataVencimento: true, fornecedorNome: true, numeroDocumento: true, categoriaNome: true },
    }),
    prisma.contaReceber.findMany({
      where: { saldo: { gt: 0 }, status: { not: "CANCELADO" } },
      select: { saldo: true, dataVencimento: true, clienteNome: true, numeroDocumento: true },
    }),
    calcularPrevisaoFaturamento(hoje), // fonte única (mesma da aba Previsão de faturamento)
    prisma.omieSyncState.findUnique({ where: { id: "contapagar" }, select: { ultimoSync: true } }),
    prisma.omieSyncState.findUnique({ where: { id: "contareceber" }, select: { ultimoSync: true } }),
    prisma.diretoriaConfig.findUnique({ where: { id: "saldoCaixa" } }),
  ]);

  const pagarItems = pagarRaw.map((c) => ({ saldo: Math.max(0, (c.valor || 0) - (c.valorPago || 0)), venc: c.dataVencimento, nome: c.fornecedorNome || "—", doc: c.numeroDocumento, natureza: classificarNatureza(c.categoriaNome) }));
  const recItems = recRaw.map((c) => ({ saldo: c.saldo || 0, venc: c.dataVencimento, nome: c.clienteNome || "—", doc: c.numeroDocumento }));

  const aPagar = balde(pagarItems, hoje, em30);
  const aReceber = balde(recItems, hoje, em30);
  const posicao = r2(aReceber.total - aPagar.total);

  // ── Previsão de receita (a receber projetado) — vem da lib (líquido de impostos,
  // sem faturamentos projetados do Omie). Aqui só montamos o formato do resumo. ──
  const previsao = {
    liquida: true,
    receitaTotal: prev.receitaTotal,
    faturado: prev.faturadoTotal,
    aFaturar: prev.totalSaldo,
    projetadoExcluido: prev.projetadoExcluido,
    qtdObras: prev.ops.length,
    ops: [...prev.ops]
      .sort((a, b) => b.saldoLiq - a.saldoLiq)
      .slice(0, 25)
      .map((o) => ({ numero: o.numero, cliente: o.cliente, obra: o.obra, receita: o.receitaLiq, faturado: o.faturadoLiq, pctFaturado: o.pctFaturado, aFaturar: o.saldoLiq })),
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

  // ── Categorias do a pagar (análise de cortes) ──
  const porCategoria = new Map();
  for (const c of pagarRaw) {
    const s = Math.max(0, (c.valor || 0) - (c.valorPago || 0));
    if (s <= 0.005) continue;
    const k = (c.categoriaNome || "").trim() || "(sem categoria)";
    const e = porCategoria.get(k) || { valor: 0, qtd: 0, vencido: 0 };
    e.valor += s; e.qtd++;
    if (c.dataVencimento && new Date(c.dataVencimento) < hoje) e.vencido += s;
    porCategoria.set(k, e);
  }
  const categoriasPagar = [...porCategoria.entries()]
    .map(([nome, e]) => ({ nome, valor: r2(e.valor), qtd: e.qtd, vencido: r2(e.vencido), pct: aPagar.total > 0 ? Math.round((e.valor / aPagar.total) * 100) : 0 }))
    .sort((a, b) => b.valor - a.valor);

  // ── Fluxo de caixa diário (próximos 60 dias) ──
  // Por dia: a pagar (saída) × recebimento faturado (entrada real) × recebimento
  // previsto da carteira (entrada projetada). Vencidos caem no 1º dia (hoje). O
  // acumulado parte de zero (não considera o saldo de caixa inicial) — serve pra
  // achar o pico de necessidade e decidir antecipações.
  const DIAS_FLUXO = 60;
  const fimFluxo = new Date(hoje.getTime() + DIAS_FLUXO * 86400000);
  const hojeK = hoje.toISOString().slice(0, 10);
  // Vencidos NÃO entram na projeção diária — viram um bloco "em aberto" à parte.
  // O dia de hoje recebe só o que vence hoje.
  const destino = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    if (dt < hoje) return "VENCIDO";
    if (dt > fimFluxo) return null;
    return dt.toISOString().slice(0, 10);
  };
  const dias = new Map();
  const venc = { pagarOper: 0, pagarFin: 0, pagarInv: 0, receberFat: 0, receberPrev: 0 };
  const addDia = (k, campo, v) => {
    const e = dias.get(k) || { pagarOper: 0, pagarFin: 0, pagarInv: 0, receberFat: 0, receberPrev: 0 };
    e[campo] += v; dias.set(k, e);
  };
  const lanca = (d, campo, v) => {
    const k = destino(d);
    if (!k) return;
    if (k === "VENCIDO") venc[campo] += v; else addDia(k, campo, v);
  };
  const campoNat = { OPERACIONAL: "pagarOper", FINANCEIRO: "pagarFin", INVESTIMENTO: "pagarInv" };
  let totPagarOper = 0, totPagarFin = 0, totPagarInv = 0;
  for (const it of pagarItems) {
    if (it.saldo <= 0.005) continue;
    const k = destino(it.venc); if (!k) continue;
    lanca(it.venc, campoNat[it.natureza] || "pagarOper", it.saldo);
    if (it.natureza === "FINANCEIRO") totPagarFin += it.saldo;
    else if (it.natureza === "INVESTIMENTO") totPagarInv += it.saldo;
    else totPagarOper += it.saldo;
  }
  for (const it of recItems) { if (it.saldo > 0.005) lanca(it.venc, "receberFat", it.saldo); }
  for (const o of prev.ops) { if (o.saldoLiq > 0.005 && o.dataRecebimento) lanca(o.dataRecebimento, "receberPrev", o.saldoLiq); }

  // Saldo de caixa PROJETADO dia a dia (parte do saldo atual; só hoje→futuro).
  const saldoInicial = r2(cfgSaldo?.valor || 0);
  let acum = saldoInicial, piorAcumulado = saldoInicial, piorDia = hojeK;
  const fluxoDiario = [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, e]) => {
    const pagar = e.pagarOper + e.pagarFin + e.pagarInv;
    acum += e.receberFat + e.receberPrev - pagar;
    if (acum < piorAcumulado) { piorAcumulado = acum; piorDia = dia; }
    return { dia, pagarOper: r2(e.pagarOper), pagarFin: r2(e.pagarFin), pagarInv: r2(e.pagarInv), receberFat: r2(e.receberFat), receberPrev: r2(e.receberPrev), acumulado: r2(acum) };
  });
  const fluxoVencido = { pagarOper: r2(venc.pagarOper), pagarFin: r2(venc.pagarFin), pagarInv: r2(venc.pagarInv), receberFat: r2(venc.receberFat), receberPrev: r2(venc.receberPrev) };
  const fluxoNaturezas = { operacional: r2(totPagarOper), financeiro: r2(totPagarFin), investimento: r2(totPagarInv) };
  const ddmm = (k) => (k ? k.split("-").slice(1).reverse().join("/") : "");

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
  if (piorAcumulado < 0)
    flags.push({ sev: "alta", texto: `Caixa projetado chega a ${fmtR$(piorAcumulado)} por volta de ${ddmm(piorDia)} (partindo de ${fmtR$(saldoInicial)} hoje, a pagar supera recebimentos + previsões) — avaliar antecipar faturamento para cobrir.` });

  return NextResponse.json({
    aPagar, aReceber, posicao, previsao, categoriasPagar,
    ruptura: { janelas, topCredores, topTitulosPagar, cobertura, flags, fluxoDiario, fluxoVencido, fluxoNaturezas, piorAcumulado: r2(piorAcumulado), piorDia, saldoInicial, saldoAtualizadoEm: cfgSaldo?.atualizadoEm || null },
    sync: { pagar: syncPg?.ultimoSync || null, receber: syncRc?.ultimoSync || null },
  });
}
