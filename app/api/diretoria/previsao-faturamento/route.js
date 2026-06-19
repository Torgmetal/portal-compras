// GET /api/diretoria/previsao-faturamento — linha do tempo de faturamento previsto.
// Pega o saldo a faturar líquido de cada OP ativa e o DATA: a data de faturamento
// vem da entrega (cronograma vigente › prazo da OP) e a de recebimento soma o prazo
// de pagamento do cliente (do kickoff). Cruza com o progresso de produção pra
// sinalizar o que dá pra antecipar. Gate próprio (requireDiretoria).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const maxDuration = 30;

const r2 = (n) => Math.round((n || 0) * 100) / 100;
// Ordem dos setores de produção (do início ao pronto). "pintado/expedido" = pronto p/ faturar.
const ORDEM_SETOR = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const IDX_PRONTO = ORDEM_SETOR.indexOf("PINTURA");
const taxaLinha = (r) => (((r.icmsPct || 0) + (r.ipiPct || 0) + (r.pisPct || 0) + (r.cofinsPct || 0) + (r.issPct || 0) + (r.irrfPct || 0) + (r.csllPct || 0)) / 100);
const ehProjetado = (m) => (m.status || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().startsWith("nao faturado");

// Extrai dias do texto livre de prazo de pagamento ("30 dias após NF", "15 DDL...", "60 dias a contar")
function parsePrazoDias(txt) {
  if (!txt) return null;
  const m = String(txt).match(/(\d{1,3})\s*(dias|ddl|dd)?/i);
  return m ? parseInt(m[1], 10) : null;
}

export async function GET() {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const hoje = new Date(hojeIso + "T00:00:00.000Z");

  const ops = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] } },
    select: {
      id: true, numero: true, cliente: true, obra: true, dataFimPrevista: true,
      receitas: { select: { valor: true, icmsPct: true, ipiPct: true, pisPct: true, cofinsPct: true, issPct: true, irrfPct: true, csllPct: true } },
      medicoes: { select: { valorBruto: true, status: true } },
      kickoff: { select: { faturamentoEventos: true, tipoFaturamento: true } },
      cronogramas: { where: { ativo: true }, select: { dataFim: true }, orderBy: { dataFim: "desc" }, take: 1 },
    },
  });

  const ids = ops.map((o) => o.id);
  const prog = ids.length
    ? await prisma.pecaConjunto.groupBy({ by: ["opId", "status"], where: { opId: { in: ids }, fonte: "LPC_IMPORT" }, _sum: { pesoTotalKg: true } })
    : [];
  const progByOp = new Map();
  for (const g of prog) {
    if (!progByOp.has(g.opId)) progByOp.set(g.opId, []);
    progByOp.get(g.opId).push({ status: g.status, peso: g._sum.pesoTotalKg || 0 });
  }

  const linhas = [];
  for (const o of ops) {
    const receitaBruta = o.receitas.reduce((s, r) => s + (r.valor || 0), 0);
    const impostos = o.receitas.reduce((s, r) => s + (r.valor || 0) * taxaLinha(r), 0);
    const netRatio = receitaBruta > 0 ? (receitaBruta - impostos) / receitaBruta : 0;
    const faturadoBruto = o.medicoes.filter((m) => !ehProjetado(m)).reduce((s, m) => s + (m.valorBruto || 0), 0);
    const saldoLiq = r2(Math.max(0, (receitaBruta - faturadoBruto) * netRatio));
    if (saldoLiq <= 0.5) continue;

    // Data de faturamento: cronograma vigente, senão prazo de entrega da OP
    const cronoFim = o.cronogramas[0]?.dataFim || null;
    const entrega = cronoFim || o.dataFimPrevista || null;
    const base = cronoFim ? "cronograma" : o.dataFimPrevista ? "prazo OP" : "sem data";

    // Prazo de pagamento (do kickoff); usa o maior dos eventos, senão estima 30 dias
    const eventos = Array.isArray(o.kickoff?.faturamentoEventos) ? o.kickoff.faturamentoEventos : [];
    const prazos = eventos.map((e) => parsePrazoDias(e.prazoPagamento)).filter((n) => n != null);
    const prazoDias = prazos.length ? Math.max(...prazos) : 30;
    const prazoEstimado = prazos.length === 0;

    // Progresso de produção (por peso)
    const stages = progByOp.get(o.id) || [];
    const pesoTotal = stages.reduce((s, x) => s + x.peso, 0);
    let pesoPronto = 0, somaProg = 0;
    for (const st of stages) {
      const i = ORDEM_SETOR.indexOf(st.status);
      const idx = i < 0 ? 0 : i;
      somaProg += st.peso * (idx / (ORDEM_SETOR.length - 1));
      if (idx >= IDX_PRONTO) pesoPronto += st.peso;
    }
    const pctProducao = pesoTotal > 0 ? Math.round((somaProg / pesoTotal) * 100) : null;
    const pctPronto = pesoTotal > 0 ? Math.round((pesoPronto / pesoTotal) * 100) : 0;

    const billing = entrega ? new Date(entrega) : null;
    const cash = billing ? new Date(billing.getTime() + prazoDias * 86400000) : null;
    const atrasado = billing ? billing < hoje : false; // data de faturamento já passou e não faturou
    const antecipavel = pctPronto >= 50 && billing && billing - hoje > 30 * 86400000;

    linhas.push({
      numero: o.numero, cliente: o.cliente, obra: o.obra, saldoLiq,
      dataFaturamento: billing ? billing.toISOString() : null,
      dataRecebimento: cash ? cash.toISOString() : null,
      prazoDias, prazoEstimado, base, atrasado, antecipavel,
      pctProducao, pctPronto,
      eventos: eventos.map((e) => ({ descricao: e.descricao || "", percentual: e.percentual ?? null, prazoPagamento: e.prazoPagamento || "" })),
    });
  }
  linhas.sort((a, b) => (a.dataFaturamento || "9999").localeCompare(b.dataFaturamento || "9999"));

  // Séries mensais (YYYY-MM)
  const fatMes = new Map(), recMes = new Map();
  let totalSaldo = 0, totalAtrasado = 0, qtdAntecipavel = 0;
  for (const l of linhas) {
    totalSaldo += l.saldoLiq;
    if (l.atrasado) totalAtrasado += l.saldoLiq;
    if (l.antecipavel) qtdAntecipavel++;
    if (l.dataFaturamento) { const k = l.dataFaturamento.slice(0, 7); fatMes.set(k, (fatMes.get(k) || 0) + l.saldoLiq); }
    if (l.dataRecebimento) { const k = l.dataRecebimento.slice(0, 7); recMes.set(k, (recMes.get(k) || 0) + l.saldoLiq); }
  }
  const mkSerie = (m) => [...m.entries()].map(([mes, valor]) => ({ mes, valor: r2(valor) })).sort((a, b) => a.mes.localeCompare(b.mes));

  return NextResponse.json({
    totalSaldo: r2(totalSaldo), totalAtrasado: r2(totalAtrasado), qtd: linhas.length, qtdAntecipavel,
    faturamentoMes: mkSerie(fatMes), recebimentoMes: mkSerie(recMes),
    ops: linhas,
  });
}
