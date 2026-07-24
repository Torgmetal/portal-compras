// GET — custo de TRANSFORMAÇÃO (rateio por kg-op) × receita de fabricação da OP,
// pra medir a MARGEM. Modelo validado jul/2026 (ver lib/rateio-transformacao.js).
// Material é FD/verba (pass-through) e fica fora; a margem sai da fabricação.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";
import { custoTransformacaoOP } from "@/lib/rateio-transformacao";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAT_CATS = ["MATERIA_PRIMA", "TINTA", "PARAFUSOS", "PLACA_WALL", "STEEL_DECK", "TELHAS", "CALHAS_RUFOS"];

// Blindagem financeira: ADMIN, módulos COMERCIAL/FINANCEIRO e allowlist da
// Diretoria veem custo/margem. Demais setores ficam de fora.
async function gateFinanceiro() {
  const user = await requireUser();
  const mods = user.modulos || [];
  if (user.tipo === "ADMIN" || mods.includes("COMERCIAL") || mods.includes("FINANCEIRO") || (await temAcessoDiretoria(user.email))) return user;
  throw new Error("Forbidden");
}

export async function GET(_req, { params }) {
  try { await gateFinanceiro(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const [transf, receitas, medicoes, itens, listas] = await Promise.all([
    custoTransformacaoOP(op.id),
    prisma.oPReceita.findMany({ where: { opId: op.id }, select: { categoria: true, valor: true } }),
    prisma.oPMedicao.findMany({ where: { opId: op.id }, select: { valorBruto: true, etapa: true, status: true } }),
    prisma.oPItem.findMany({ where: { opId: op.id }, select: { categoria: true, valorVerba: true, faturamentoDireto: true } }),
    prisma.listaExpedicao.findMany({ where: { OR: [{ opId: op.id }, { opNumero: op.numero }] }, select: { marcasJson: true } }),
  ]);

  // Peso da obra = SEMPRE o da lista de expedição (regra do Vitor). Dedup por
  // marca (mantém a 1ª frente). Nunca expor o kg·setor do rateio na tela.
  const marcasVistas = new Set();
  let pesoObraKg = 0;
  for (const l of listas) {
    for (const m of Array.isArray(l.marcasJson) ? l.marcasJson : []) {
      const k = String(m.marca || "").trim().toUpperCase();
      if (!k || marcasVistas.has(k)) continue;
      marcasVistas.add(k);
      pesoObraKg += m.pesoTotal || 0;
    }
  }

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
  // Receita FATURADA (etapa 60) — exclui as medições "a faturar" (etapa 10/20,
  // romaneios futuros), que são saldo, não receita gerada.
  const naoFaturada = (m) => m.etapa === "10" || m.etapa === "20" || /n[ãa]o faturad/i.test(m.status || "");
  const faturado = medicoes.filter((m) => !naoFaturada(m)).reduce((s, m) => s + (m.valorBruto || 0), 0);
  const saldoAFaturar = baseFabricacao - faturado;

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
    pesoObraKg,
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
