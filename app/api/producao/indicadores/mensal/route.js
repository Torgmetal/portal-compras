// GET /api/producao/indicadores/mensal?ano=YYYY
// PRODUÇÃO mês a mês = PREPARAÇÃO (Corte) + acumulado (YTD), avaliada contra a
// meta de 6.000 kg/dia útil.
//
// ⚠️ O peso é POR PEÇA. A mesma peça é apontada em Corte, Montagem, Solda,
// Acabamento, Jato e Pintura — somar `produzidoKg` de todos os setores conta o
// peso da peça 4-6× (inflava: jan dava 705t sendo que o corte foi ~196t). Cada
// peça é cortada UMA única vez, então a PREPARAÇÃO/Corte é o peso físico
// produzido contado uma vez só (e já é a base da meta e da nota).
//
// Datas do Syneco são UTC-naïve (o relógio BRT gravado como se fosse UTC), então
// o mês é a parte UTC direta, SEM offset -03:00 (ver lib/syneco-dia.js: aplicar
// o offset jogava o corte da madrugada pro mês anterior).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { whereSetorSyneco } from "@/lib/syneco-dia";

export const runtime = "nodejs";
export const maxDuration = 60;

const META_CORTE_DIA = 6000; // kg/dia útil — meta da preparação/corte (setor inteiro)
const MM = (m) => String(m).padStart(2, "0");

// dias úteis do mês; no mês corrente conta só até `ateDia` (dias já decorridos)
function diasUteisMes(ano, mes, ateDia) {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const fim = ateDia && ateDia < ultimo ? ateDia : ultimo;
  let n = 0;
  for (let d = 1; d <= fim; d++) { const w = new Date(Date.UTC(ano, mes - 1, d)).getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export async function GET(req) {
  try { await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  try {
    const { searchParams } = new URL(req.url);
    const agoraBRT = new Date(Date.now() - 3 * 3600 * 1000); // relógio BRT (Syneco é BRT-como-UTC)
    const anoBRT = agoraBRT.getUTCFullYear();
    const p = parseInt(searchParams.get("ano"), 10);
    const ano = p >= 2020 && p <= 2100 ? p : anoBRT;
    const ehAnoCorrente = ano === anoBRT;
    const ultimoMes = ehAnoCorrente ? agoraBRT.getUTCMonth() + 1 : 12;

    // 1 agregado por mês (só a preparação/Corte) — janela UTC-naïve, sem offset
    const aggs = await Promise.all(
      Array.from({ length: ultimoMes }, (_, i) => {
        const m = i + 1;
        const gte = new Date(`${ano}-${MM(m)}-01T00:00:00.000Z`);
        const lt = m === 12 ? new Date(`${ano + 1}-01-01T00:00:00.000Z`) : new Date(`${ano}-${MM(m + 1)}-01T00:00:00.000Z`);
        return prisma.mesApontamento.aggregate({
          where: { AND: [whereSetorSyneco("CORTE"), { dataInicio: { gte, lt } }] },
          _sum: { produzidoKg: true, produzidoUn: true }, _count: true,
        });
      })
    );

    const meses = [];
    let accKg = 0, accUn = 0, accApont = 0, accDu = 0;
    for (let m = 1; m <= ultimoMes; m++) {
      const a = aggs[m - 1];
      const kg = a._sum.produzidoKg || 0, un = a._sum.produzidoUn || 0, apont = a._count || 0;
      const ateDia = ehAnoCorrente && m === ultimoMes ? agoraBRT.getUTCDate() : null;
      const du = diasUteisMes(ano, m, ateDia);
      const metaKg = META_CORTE_DIA * du;
      const metaPct = metaKg > 0 ? (kg / metaKg) * 100 : null;
      meses.push({
        mes: m, kg: Math.round(kg), un: Math.round(un), apontamentos: apont,
        diasUteis: du, kgDia: du > 0 ? Math.round(kg / du) : 0, metaKg,
        metaPct: metaPct == null ? null : Math.round(metaPct * 10) / 10,
        nota: metaPct == null ? null : Math.min(100, Math.round(metaPct)),
      });
      accKg += kg; accUn += un; accApont += apont; accDu += du;
    }

    const metaKgAcc = META_CORTE_DIA * accDu;
    const metaPctAcc = metaKgAcc > 0 ? (accKg / metaKgAcc) * 100 : null;
    const acumulado = {
      kg: Math.round(accKg), un: Math.round(accUn), apontamentos: accApont, diasUteis: accDu,
      kgDia: accDu > 0 ? Math.round(accKg / accDu) : 0, metaKg: metaKgAcc,
      metaPct: metaPctAcc == null ? null : Math.round(metaPctAcc * 10) / 10,
      nota: metaPctAcc == null ? null : Math.min(100, Math.round(metaPctAcc)),
    };

    return NextResponse.json({ success: true, ano, metaDiaKg: META_CORTE_DIA, meses, acumulado });
  } catch (e) {
    console.error("indicadores produção mensal:", e?.message || e);
    return NextResponse.json({ success: false, error: "Falha ao calcular a evolução mensal da produção." }, { status: 500 });
  }
}
