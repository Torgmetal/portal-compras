// GET /api/diretoria/dre?meses=N — DRE Alvo × Realizado do ano 2026.
// Alvo: planilha gerencial (lib/dre-alvo.js), proporcional aos N meses.
// Realizado: faturamento (ContaReceber emitida) e a pagar (ContaPagar emitida)
// por categoria, mapeado aos grupos do DRE pelo prefixo do categoriaNome.
// Competência = data de emissão. Gate próprio (requireDiretoria).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";
import { DRE_ANO, DRE_GRUPOS, DRE_RESULTADOS, TAXA_DEDUCAO, prefixoCategoria, ehParcelamento, ehComissao } from "@/lib/dre-alvo";

export const runtime = "nodejs";
export const maxDuration = 30;

const r2 = (n) => Math.round((n || 0) * 100) / 100;

export async function GET(req) {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const nowIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [yy, mm] = nowIso.split("-").map(Number);
  const mesesDefault = yy > DRE_ANO ? 12 : yy < DRE_ANO ? 1 : mm;
  let meses = parseInt(new URL(req.url).searchParams.get("meses"), 10);
  if (!Number.isFinite(meses)) meses = mesesDefault;
  meses = Math.min(12, Math.max(1, meses));

  const ini = new Date(Date.UTC(DRE_ANO, 0, 1));
  const fim = new Date(Date.UTC(DRE_ANO, meses, 1)); // exclusivo
  const fator = meses / 12;

  const [rc, pg] = await Promise.all([
    prisma.contaReceber.findMany({ where: { dataEmissao: { gte: ini, lt: fim }, status: { not: "CANCELADO" } }, select: { valor: true } }),
    prisma.contaPagar.findMany({ where: { dataEmissao: { gte: ini, lt: fim }, status: { not: "CANCELADO" } }, select: { valor: true, categoriaNome: true } }),
  ]);

  const receita = r2(rc.reduce((s, c) => s + (c.valor || 0), 0));

  // Agrega a pagar por prefixo de categoria
  const porPrefixo = new Map();
  let semCategoria = 0, parcelFin = 0, comissoes = 0;
  for (const c of pg) {
    const v = c.valor || 0;
    const nome = (c.categoriaNome || "").trim();
    if (!nome) { semCategoria += v; continue; }
    if (ehComissao(nome)) { comissoes += v; continue; } // despesa comercial/comissão → Gastos Variáveis
    const pre = prefixoCategoria(nome);
    // prefixo 2 = impostos s/ venda (absorvidos na dedução % abaixo); só o parcelamento vira financeira
    if (pre === "2") { if (ehParcelamento(nome)) parcelFin += v; continue; }
    if (!pre) { semCategoria += v; continue; }
    porPrefixo.set(pre, (porPrefixo.get(pre) || 0) + v);
  }

  // Deduções = % da receita (igual ao alvo); não estão lançadas no a pagar (retidas na nota)
  const deducoes = r2(receita * TAXA_DEDUCAO);

  // Realizado por grupo + prefixos usados
  const usados = new Set();
  const grupos = DRE_GRUPOS.map((g) => {
    let real = 0;
    for (const p of g.prefixos) { real += porPrefixo.get(p) || 0; usados.add(p); }
    if (g.key === "financeiras") real += parcelFin; // 2.x parcelamento entra em financeiras
    if (g.key === "variaveis") real = comissoes;    // comissões/despesas comerciais
    return { ...g, alvo: r2(g.alvoAno * fator), real: r2(real) };
  });
  const get = (k) => grupos.find((g) => g.key === k);

  // Não classificado = sem categoria + prefixos não mapeados em nenhum grupo
  let outrosNaoMapeados = 0;
  for (const [p, v] of porPrefixo) if (!usados.has(p)) outrosNaoMapeados += v;
  const naoClassificado = r2(semCategoria + outrosNaoMapeados);

  const soma = (secao) => r2(grupos.filter((g) => g.secao === secao).reduce((s, g) => s + g.real, 0));
  const custoTotalReal = soma("CUSTO");
  const sgaReal = soma("SGA");
  const ativosReal = get("ativos").real;
  const financeirasReal = get("financeiras").real;
  const receitaLiquida = r2(receita - deducoes);
  const resultadoBruto = r2(receitaLiquida - custoTotalReal);
  const resultadoOperacional = r2(resultadoBruto - sgaReal);
  const resultadoFinal = r2(resultadoOperacional - ativosReal - financeirasReal - naoClassificado);

  const alvoP = (v) => r2(v * fator);
  const custos = grupos.filter((g) => g.secao === "CUSTO");
  const despesasSga = grupos.filter((g) => g.secao === "SGA");

  // Linhas ordenadas pro front (sentido: "receita"=mais é bom, "custo"=mais é ruim)
  const L = (label, nivel, kind, alvo, real, sentido) => ({ label, nivel, kind, alvo: r2(alvo), real: r2(real), sentido });
  const linhas = [
    L("Receita Bruta", 0, "receita", alvoP(DRE_RESULTADOS.receitaLiquida + DRE_RESULTADOS.deducoes), receita, "receita"),
    L("(−) Deduções", 1, "deducao", alvoP(DRE_RESULTADOS.deducoes), deducoes, "custo"),
    L("Receita Líquida", 0, "subtotal", alvoP(DRE_RESULTADOS.receitaLiquida), receitaLiquida, "receita"),
    L("Custo Total", 0, "grupoHeader", alvoP(DRE_RESULTADOS.custoTotal), custoTotalReal, "custo"),
    ...custos.map((g) => L(g.label, 1, "custo", g.alvo, g.real, "custo")),
    L("Resultado Bruto", 0, "subtotal", alvoP(DRE_RESULTADOS.resultadoBruto), resultadoBruto, "receita"),
    L("SG&A (despesas)", 0, "grupoHeader", alvoP(DRE_RESULTADOS.sga), sgaReal, "custo"),
    ...despesasSga.map((g) => L(g.label, 1, "despesa", g.alvo, g.real, "custo")),
    L("Resultado Operacional", 0, "subtotal", alvoP(DRE_RESULTADOS.resultadoOperacional), resultadoOperacional, "receita"),
    L("(−) Ativos (investimentos)", 1, "abaixo", get("ativos").alvo, ativosReal, "custo"),
    L("(−) Despesas Financeiras", 1, "abaixo", get("financeiras").alvo, financeirasReal, "custo"),
    L("(−) Não classificado", 1, "naoclass", 0, naoClassificado, "custo"),
    L("Resultado Final", 0, "resultado", alvoP(DRE_RESULTADOS.resultadoFinal), resultadoFinal, "receita"),
  ];

  return NextResponse.json({
    ano: DRE_ANO, meses, fator,
    receitaBrutaAno: r2(DRE_RESULTADOS.receitaLiquida + DRE_RESULTADOS.deducoes),
    naoClassificado, semCategoria: r2(semCategoria),
    linhas,
  });
}
