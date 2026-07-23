// GET — custo de TRANSFORMAÇÃO (rateio por kg-op) × receita de fabricação da OP,
// pra medir a MARGEM. Modelo validado jul/2026 (ver lib/rateio-transformacao.js).
// Material é FD/verba (pass-through) e fica fora; a margem sai da fabricação.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { custoTransformacaoOP } from "@/lib/rateio-transformacao";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO"];
const MAT_CATS = ["MATERIA_PRIMA", "TINTA", "PARAFUSOS", "PLACA_WALL", "STEEL_DECK", "TELHAS", "CALHAS_RUFOS"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const [transf, receitas, medAgg, itens] = await Promise.all([
    custoTransformacaoOP(op.id),
    prisma.oPReceita.findMany({ where: { opId: op.id }, select: { categoria: true, valor: true } }),
    prisma.oPMedicao.aggregate({ where: { opId: op.id }, _sum: { valorBruto: true }, _count: { _all: true } }),
    prisma.oPItem.findMany({ where: { opId: op.id }, select: { categoria: true, valorVerba: true, faturamentoDireto: true } }),
  ]);

  // Receita por natureza. FABRICACAO+PROJETO = base de margem ("o que sobra");
  // o resto (OUTRO/MATERIAL) é entrada/repasse acordado no início.
  let fabricacao = 0, projeto = 0, entrada = 0, receitaTotal = 0;
  for (const r of receitas) {
    const v = r.valor || 0;
    receitaTotal += v;
    if (r.categoria === "FABRICACAO") fabricacao += v;
    else if (r.categoria === "PROJETO") projeto += v;
    else entrada += v;
  }
  const baseFabricacao = fabricacao + projeto;
  const faturado = medAgg._sum.valorBruto || 0;
  const saldoAFaturar = baseFabricacao - faturado; // bate com o "a faturar" do portal

  // Material orçado (verba) — só informativo; FD é pass-through (fora da margem).
  let verbaCompra = 0, verbaFD = 0;
  for (const it of itens) {
    if (!MAT_CATS.includes(it.categoria)) continue;
    if (it.faturamentoDireto) verbaFD += it.valorVerba || 0;
    else verbaCompra += it.valorVerba || 0;
  }

  const custo = transf.total;
  const resultadoAcumulado = faturado - custo; // realizado: faturado − custo incorrido

  return NextResponse.json({
    op: { numero: op.numero, obra: op.obra },
    receita: { total: receitaTotal, fabricacao, projeto, entrada, baseFabricacao },
    faturado,
    saldoAFaturar,
    custoTransformacao: custo,
    kgProduzido: transf.kgTotal,
    porMes: transf.detalhe,
    material: { verbaCompra, verbaFD, total: verbaCompra + verbaFD },
    resultadoAcumulado,
    flags: {
      semReceita: receitaTotal <= 0,
      semFaturado: faturado <= 0,
      custoIncompleto2025: transf.shareForaJanela > 0.1,
      shareForaJanela: transf.shareForaJanela,
    },
  });
}
