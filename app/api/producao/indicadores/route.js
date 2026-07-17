// GET /api/producao/indicadores?de=YYYY-MM-DD&ate=YYYY-MM-DD
// Indicadores do setor Produção: produção por setor (Syneco/MesApontamento),
// aderência ao plano (previsto × realizado), meta de preparação e qualidade
// (refugo/retrabalho). Devolve notaSetor pro card da visão geral + detalhamento.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { whereSetorSyneco } from "@/lib/syneco-dia";

export const runtime = "nodejs";

const META_CORTE_DIA = 6000; // kg/dia útil — meta da preparação/corte (setor inteiro)
const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
const SETOR_LABEL = { CORTE: "Preparação / Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jateamento", PINTURA: "Pintura" };

const fmtDia = (d) => d.toISOString().split("T")[0];
function diasUteis(de, ate) {
  let n = 0; const d = new Date(`${de}T12:00:00Z`); const f = new Date(`${ate}T12:00:00Z`);
  while (d <= f) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
}
// nota ponderada ignorando indicadores sem base (nota null) — renormaliza pesos
function notaPonderada(indicadores) {
  const validos = indicadores.filter((i) => i.nota != null);
  const somaPeso = validos.reduce((a, i) => a + i.peso, 0);
  if (!somaPeso) return null;
  return validos.reduce((a, i) => a + i.nota * i.peso, 0) / somaPeso;
}

export async function GET(req) {
  try { await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const hoje = new Date();
  const de = url.searchParams.get("de") || fmtDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const ate = url.searchParams.get("ate") || fmtDia(hoje);

  // janela em BRT (UTC-3): [de 00:00 BRT, (ate+1) 00:00 BRT)
  const gte = new Date(`${de}T03:00:00.000Z`);
  const lt = new Date(new Date(`${ate}T03:00:00.000Z`).getTime() + 24 * 3600 * 1000);

  try {
    // ─── 1. Produção por setor (Syneco) ───────────────────────
    const porSetor = [];
    let totalKg = 0, totalUn = 0, totalRej = 0, totalRetr = 0, totalApont = 0;
    for (const s of SETORES) {
      const agg = await prisma.mesApontamento.aggregate({
        where: { AND: [whereSetorSyneco(s), { dataInicio: { gte, lt } }] },
        _sum: { produzidoKg: true, produzidoUn: true, rejeitado: true, retrabalhado: true },
        _count: true,
      });
      const kg = agg._sum.produzidoKg || 0, un = agg._sum.produzidoUn || 0;
      const rej = agg._sum.rejeitado || 0, retr = agg._sum.retrabalhado || 0;
      porSetor.push({ setor: s, label: SETOR_LABEL[s], kg, un, rejeitado: rej, retrabalhado: retr, apontamentos: agg._count });
      totalKg += kg; totalUn += un; totalRej += rej; totalRetr += retr; totalApont += agg._count;
    }

    // ─── 2. Meta de preparação (Corte 6.000 kg/dia) ──────────
    // É o ÚNICO alvo real e confiável do Produção (base dos "dias de carga").
    // Refugo/retrabalho vêm zerados do Syneco e a meta do PMP é wishlist
    // acumulado — nenhum dos dois serve de indicador; não invento nota deles.
    const du = diasUteis(de, ate);
    const metaCorte = META_CORTE_DIA * du;
    const kgCorte = porSetor.find((x) => x.setor === "CORTE")?.kg || 0;
    const metaPct = metaCorte > 0 ? (kgCorte / metaCorte) * 100 : null;

    // média diária realizada por setor (kg/dia útil) — informativo
    const porSetorComMedia = porSetor.map((s) => ({ ...s, kgDia: du > 0 ? s.kg / du : 0 }));

    // ─── Nota do setor = atingimento da meta de preparação ────
    const indicadores = [
      { id: "meta", label: "Meta de preparação (6.000 kg/dia)", peso: 1, nota: metaPct == null ? null : Math.min(100, Math.round(metaPct)) },
    ];
    const nota = notaPonderada(indicadores);

    return NextResponse.json({
      success: true,
      periodo: { de, ate, diasUteis: du },
      notaSetor: { nota: nota == null ? null : Math.round(nota * 10) / 10, indicadores },
      producaoPorSetor: porSetorComMedia,
      totais: { kg: totalKg, un: totalUn, apontamentos: totalApont, kgDia: du > 0 ? totalKg / du : 0 },
      metaPreparacao: { metaKg: metaCorte, realizadoKg: kgCorte, metaDiaKg: META_CORTE_DIA, kgDia: du > 0 ? kgCorte / du : 0, diasUteis: du, pct: metaPct },
    });
  } catch (e) {
    console.error("indicadores produção:", e?.message || e);
    return NextResponse.json({ success: false, error: "Falha ao calcular indicadores de produção." }, { status: 500 });
  }
}
