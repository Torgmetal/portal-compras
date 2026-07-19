// GET /api/comercial/indicadores/mensal?ano=YYYY
// COMERCIAL mês a mês + acumulado (YTD): RFQs recebidas (qtd/valor),
// propostas enviadas + tempo de resposta, ganhas/perdidas (por mês de
// fechamento) e win rate. Nota do mês = win rate + tempo de resposta (os que
// traduzem bem pra mês; margem é por contrato, pipeline/concentração são
// snapshots cumulativos → ficam no dashboard anual). Busca o ano uma vez.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const PRAZO_ALVO_DIAS = 7;
const round1 = (n) => Math.round((n || 0) * 10) / 10;
const emAno = (d, ini, fim) => d && new Date(d) >= ini && new Date(d) <= fim;

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  try {
    const { searchParams } = new URL(req.url);
    const agora = new Date();
    const p = parseInt(searchParams.get("ano"), 10);
    const ano = p >= 2020 && p <= 2100 ? p : agora.getFullYear();
    const ultimoMes = ano === agora.getFullYear() ? agora.getMonth() + 1 : 12;
    const ini = new Date(ano, 0, 1);
    const fim = new Date(ano, 11, 31, 23, 59, 59, 999);

    // qualquer orçamento com um evento (solicitação / envio / fechamento) no ano
    const orcs = await prisma.orcamento.findMany({
      where: { OR: [{ dataSolicitada: { gte: ini, lte: fim } }, { dataEnvio: { gte: ini, lte: fim } }, { dataFechamento: { gte: ini, lte: fim } }] },
      select: { valor: true, status: true, dataSolicitada: true, dataEnvio: true, dataFechamento: true },
    });

    const B = Array.from({ length: 12 }, () => ({ rfq: 0, valorRfq: 0, env: 0, temposoma: 0, prazo: 0, ganhas: 0, valorGanho: 0, perdidas: 0 }));
    for (const o of orcs) {
      if (emAno(o.dataSolicitada, ini, fim)) { const b = B[new Date(o.dataSolicitada).getMonth()]; b.rfq++; b.valorRfq += o.valor || 0; }
      if (emAno(o.dataEnvio, ini, fim) && o.dataSolicitada) {
        const b = B[new Date(o.dataEnvio).getMonth()]; b.env++;
        const dias = Math.max(0, Math.round((new Date(o.dataEnvio) - new Date(o.dataSolicitada)) / 86400000));
        b.temposoma += dias; if (dias <= PRAZO_ALVO_DIAS) b.prazo++;
      }
      if (o.status === "FECHADA" || o.status === "PERDIDA") {
        const dref = o.dataFechamento || o.dataSolicitada;
        if (emAno(dref, ini, fim)) {
          const b = B[new Date(dref).getMonth()];
          if (o.status === "FECHADA") { b.ganhas++; b.valorGanho += o.valor || 0; } else b.perdidas++;
        }
      }
    }

    // nota do mês: WR 60% + tempo 40% (renormalizado de 0.3/0.2), só sobre os disponíveis
    const notaMes = (b) => {
      const desf = b.ganhas + b.perdidas;
      const wr = desf > 0 ? (b.ganhas / desf) * 100 : null;
      const notaWR = wr == null ? null : Math.min((wr / 40) * 100, 100);
      const notaTempo = b.env > 0 ? (b.prazo / b.env) * 100 : null;
      let nota = null;
      if (notaWR != null && notaTempo != null) nota = notaWR * 0.6 + notaTempo * 0.4;
      else if (notaWR != null) nota = notaWR;
      else if (notaTempo != null) nota = notaTempo;
      return { wr, nota: nota == null ? null : round1(nota) };
    };

    const meses = [];
    const acc = { rfq: 0, valorRfq: 0, env: 0, temposoma: 0, prazo: 0, ganhas: 0, valorGanho: 0, perdidas: 0 };
    for (let m = 1; m <= ultimoMes; m++) {
      const b = B[m - 1];
      const { wr, nota } = notaMes(b);
      meses.push({
        mes: m, rfqs: b.rfq, valorRfq: Math.round(b.valorRfq),
        enviadas: b.env, tempoMedio: b.env > 0 ? round1(b.temposoma / b.env) : null, dentroPrazoPct: b.env > 0 ? round1((b.prazo / b.env) * 100) : null,
        ganhas: b.ganhas, valorGanho: Math.round(b.valorGanho), perdidas: b.perdidas,
        winRate: wr == null ? null : round1(wr), nota,
      });
      for (const k of Object.keys(acc)) acc[k] += b[k];
    }

    const { wr: wrAcc, nota: notaAcc } = notaMes(acc);
    const acumulado = {
      rfqs: acc.rfq, valorRfq: Math.round(acc.valorRfq),
      enviadas: acc.env, tempoMedio: acc.env > 0 ? round1(acc.temposoma / acc.env) : null, dentroPrazoPct: acc.env > 0 ? round1((acc.prazo / acc.env) * 100) : null,
      ganhas: acc.ganhas, valorGanho: Math.round(acc.valorGanho), perdidas: acc.perdidas,
      winRate: wrAcc == null ? null : round1(wrAcc), nota: notaAcc,
    };

    return NextResponse.json({ success: true, ano, prazoAlvo: PRAZO_ALVO_DIAS, meses, acumulado });
  } catch (e) {
    console.error("indicadores comercial mensal:", e?.message || e);
    return NextResponse.json({ success: false, error: "Falha ao calcular a evolução mensal do comercial." }, { status: 500 });
  }
}
