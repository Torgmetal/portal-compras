import "server-only";
import { prisma } from "@/lib/prisma";

// Cálculo da previsão de faturamento por OP — fonte única usada pela aba Previsão
// de faturamento e pelo fluxo de caixa diário (Pontos de ruptura). Data o saldo a
// faturar líquido de cada OP ativa: faturamento na entrega (cronograma vigente ›
// prazo da OP, ou override manual) e recebimento = + prazo de pagamento do cliente.

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const ORDEM_SETOR = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const IDX_PRONTO = ORDEM_SETOR.indexOf("PINTURA");
const taxaLinha = (r) => (((r.icmsPct || 0) + (r.ipiPct || 0) + (r.pisPct || 0) + (r.cofinsPct || 0) + (r.issPct || 0) + (r.irrfPct || 0) + (r.csllPct || 0)) / 100);
const ehProjetado = (m) => (m.status || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().startsWith("nao faturado");
function parsePrazoDias(txt) {
  if (!txt) return null;
  const m = String(txt).match(/(\d{1,3})\s*(dias|ddl|dd)?/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Retorna { ops:[...], totais e séries mensais }. `hoje` = Date no início do dia (UTC-naïve BRT). */
export async function calcularPrevisaoFaturamento(hoje) {
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

  const overrides = await prisma.diretoriaFaturamentoData.findMany();
  const ovByOp = new Map(overrides.map((o) => [o.opId, o]));

  let projetadoExcluido = 0;
  const linhas = [];
  for (const o of ops) {
    const receitaBruta = o.receitas.reduce((s, r) => s + (r.valor || 0), 0);
    const impostos = o.receitas.reduce((s, r) => s + (r.valor || 0) * taxaLinha(r), 0);
    const netRatio = receitaBruta > 0 ? (receitaBruta - impostos) / receitaBruta : 0;
    const faturadoBruto = o.medicoes.reduce((s, m) => {
      if (ehProjetado(m)) { projetadoExcluido += m.valorBruto || 0; return s; }
      return s + (m.valorBruto || 0);
    }, 0);
    const receitaLiq = r2(receitaBruta - impostos);
    const faturadoLiq = r2(faturadoBruto * netRatio);
    const saldoLiq = r2(Math.max(0, (receitaBruta - faturadoBruto) * netRatio));
    if (saldoLiq <= 0.5) continue;

    const cronoFim = o.cronogramas[0]?.dataFim || null;
    const entregaAuto = cronoFim || o.dataFimPrevista || null;
    const baseAuto = cronoFim ? "cronograma" : o.dataFimPrevista ? "prazo OP" : "sem data";
    const ov = ovByOp.get(o.id);
    const entrega = ov?.dataFaturamento || entregaAuto;
    const base = ov ? "manual" : baseAuto;

    const eventos = Array.isArray(o.kickoff?.faturamentoEventos) ? o.kickoff.faturamentoEventos : [];
    const prazos = eventos.map((e) => parsePrazoDias(e.prazoPagamento)).filter((n) => n != null);
    const prazoDias = prazos.length ? Math.max(...prazos) : 30;
    const prazoEstimado = prazos.length === 0;

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
    const atrasado = billing ? billing < hoje : false;
    const antecipavel = pctPronto >= 50 && billing && billing - hoje > 30 * 86400000;

    linhas.push({
      numero: o.numero, opId: o.id, cliente: o.cliente, obra: o.obra,
      receitaLiq, faturadoLiq, saldoLiq, pctFaturado: receitaBruta > 0 ? Math.round((faturadoBruto / receitaBruta) * 100) : 0,
      dataFaturamento: billing ? billing.toISOString() : null,
      dataFaturamentoAuto: entregaAuto ? new Date(entregaAuto).toISOString() : null,
      dataRecebimento: cash ? cash.toISOString() : null,
      manual: !!ov, observacao: ov?.observacao || null, base, prazoDias, prazoEstimado, atrasado, antecipavel, pctProducao, pctPronto,
      eventos: eventos.map((e) => ({ descricao: e.descricao || "", percentual: e.percentual ?? null, prazoPagamento: e.prazoPagamento || "" })),
    });
  }
  linhas.sort((a, b) => (a.dataFaturamento || "9999").localeCompare(b.dataFaturamento || "9999"));

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

  return {
    ops: linhas,
    projetadoExcluido: r2(projetadoExcluido),
    totalSaldo: r2(totalSaldo), totalAtrasado: r2(totalAtrasado), qtdAntecipavel,
    receitaTotal: r2(linhas.reduce((s, l) => s + l.receitaLiq, 0)),
    faturadoTotal: r2(linhas.reduce((s, l) => s + l.faturadoLiq, 0)),
    faturamentoMes: mkSerie(fatMes), recebimentoMes: mkSerie(recMes),
  };
}
