// GET /api/producao/indicadores/mensal?ano=YYYY
// Produção MÊS A MÊS + acumulado (YTD): kg produzido total, Corte (preparação)
// vs meta de 6.000 kg/dia útil, e a nota por mês. Busca os apontamentos do ano
// UMA vez e agrupa em memória (evita ~70 queries e o OOM do Neon).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SETOR_SYNECO_KEYWORDS } from "@/lib/syneco-dia";

export const runtime = "nodejs";
export const maxDuration = 60;

const META_CORTE_DIA = 6000;
const KW_CORTE = SETOR_SYNECO_KEYWORDS.CORTE; // corte/serra/plasma/oxico
const ehCorte = (s) => { const l = String(s || "").toLowerCase(); return KW_CORTE.some((k) => l.includes(k)); };
const round = (n) => Math.round(n || 0);
// mês (0-11) em BRT (UTC-3) da data do apontamento
const mesBRT = (d) => new Date(new Date(d).getTime() - 3 * 3600 * 1000).getUTCMonth();

// dias úteis do mês; no mês corrente do ano corrente, só até hoje
function diasUteisMes(ano, mes /*1-12*/, agora) {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  let ate = ultimoDia;
  if (ano === agora.getFullYear() && mes === agora.getMonth() + 1) ate = agora.getDate();
  let n = 0;
  for (let dia = 1; dia <= ate; dia++) { const w = new Date(ano, mes - 1, dia).getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export async function GET(req) {
  try { await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  try {
    const { searchParams } = new URL(req.url);
    const agora = new Date();
    const p = parseInt(searchParams.get("ano"), 10);
    const ano = p >= 2020 && p <= 2100 ? p : agora.getFullYear();
    const ultimoMes = ano === agora.getFullYear() ? agora.getMonth() + 1 : 12;

    // janela do ano em BRT: [ano-01-01 00:00 BRT, (ano+1)-01-01 00:00 BRT)
    const gte = new Date(`${ano}-01-01T03:00:00.000Z`);
    const lt = new Date(`${ano + 1}-01-01T03:00:00.000Z`);

    const rows = await prisma.mesApontamento.findMany({
      where: { dataInicio: { gte, lt } },
      select: { dataInicio: true, setor: true, produzidoKg: true, produzidoUn: true },
    });

    const buckets = Array.from({ length: 12 }, () => ({ kg: 0, kgCorte: 0, un: 0, apont: 0 }));
    for (const r of rows) {
      const b = buckets[mesBRT(r.dataInicio)];
      b.kg += r.produzidoKg || 0; b.un += r.produzidoUn || 0; b.apont += 1;
      if (ehCorte(r.setor)) b.kgCorte += r.produzidoKg || 0;
    }

    const meses = [];
    let accKg = 0, accCorte = 0, accMeta = 0, accUn = 0, accApont = 0, accDu = 0;
    for (let m = 1; m <= ultimoMes; m++) {
      const b = buckets[m - 1];
      const du = diasUteisMes(ano, m, agora);
      const metaKg = META_CORTE_DIA * du;
      const metaPct = metaKg > 0 ? (b.kgCorte / metaKg) * 100 : null;
      meses.push({
        mes: m, kg: round(b.kg), un: round(b.un), apontamentos: b.apont,
        kgCorte: round(b.kgCorte), kgDiaCorte: du > 0 ? round(b.kgCorte / du) : 0,
        kgDia: du > 0 ? round(b.kg / du) : 0, diasUteis: du, metaKg,
        metaPct, nota: metaPct == null ? null : Math.min(100, Math.round(metaPct)),
      });
      accKg += b.kg; accCorte += b.kgCorte; accMeta += metaKg; accUn += b.un; accApont += b.apont; accDu += du;
    }

    const metaPctAcc = accMeta > 0 ? (accCorte / accMeta) * 100 : null;
    const acumulado = {
      kg: round(accKg), un: round(accUn), apontamentos: accApont,
      kgCorte: round(accCorte), kgDiaCorte: accDu > 0 ? round(accCorte / accDu) : 0,
      kgDia: accDu > 0 ? round(accKg / accDu) : 0, diasUteis: accDu, metaKg: accMeta,
      metaPct: metaPctAcc, nota: metaPctAcc == null ? null : Math.min(100, Math.round(metaPctAcc)),
    };

    return NextResponse.json({ success: true, ano, metaDiaKg: META_CORTE_DIA, meses, acumulado });
  } catch (e) {
    console.error("indicadores produção mensal:", e?.message || e);
    return NextResponse.json({ success: false, error: "Falha ao calcular a evolução mensal." }, { status: 500 });
  }
}
