// GET — PREVISÃO da obra: projeta o resultado final a partir do avanço físico
// (kg expedido da LISTA ÷ kg planejado), do custo de transformação já incorrido
// e do saldo a faturar (Omie). Dá o break-even R$/kg do que falta e o prazo no
// ritmo de expedição atual, pra proteger o lucro previsto. Ver fase 2 do
// modelo de margem (lib/rateio-transformacao.js + torg_financeiro_margem).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";
import { custoTransformacaoOP } from "@/lib/rateio-transformacao";
import { listarPedidosVendaAbertos } from "@/lib/omie-pedidos-abertos";

export const runtime = "nodejs";
export const maxDuration = 60;
const numKey = (n) => { const i = parseInt(n, 10); return Number.isNaN(i) ? null : i; };

// Blindagem financeira: só ADMIN e allowlist da Diretoria veem a previsão.
async function gateFinanceiro() {
  const user = await requireUser();
  if (user.tipo === "ADMIN" || (await temAcessoDiretoria(user.email))) return user;
  throw new Error("Forbidden");
}

export async function GET(_req, { params }) {
  try { await gateFinanceiro(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, obra: true, dataFimPrevista: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const [transf, receitas, listas, venda] = await Promise.all([
    custoTransformacaoOP(op.id),
    prisma.oPReceita.findMany({ where: { opId: op.id }, select: { categoria: true, valor: true } }),
    prisma.listaExpedicao.findMany({ where: { OR: [{ opId: op.id }, { opNumero: op.numero }] }, select: { marcasJson: true } }),
    listarPedidosVendaAbertos().catch(() => null),
  ]);

  // Lista: planejado (Σ dedup marca) · expedido (Σ marcas expedidas) · por mês (ritmo)
  const vistas = new Set();
  let planejado = 0, expedido = 0;
  const expPorMes = {};
  for (const l of listas) for (const mk of Array.isArray(l.marcasJson) ? l.marcasJson : []) {
    const marca = String(mk.marca || "").trim().toUpperCase();
    if (!marca || vistas.has(marca)) continue;
    vistas.add(marca);
    const peso = mk.pesoTotal || 0;
    planejado += peso;
    if (mk.expedidoRomaneio && mk.dataExpedicao) {
      expedido += peso;
      const m = String(mk.dataExpedicao).slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) expPorMes[m] = (expPorMes[m] || 0) + peso;
    }
  }
  const kgRestante = Math.max(0, planejado - expedido);
  const avanco = planejado > 0 ? expedido / planejado : null;
  const mesesExp = Object.values(expPorMes).filter((v) => v > 0);
  const ritmoMensal = mesesExp.length ? mesesExp.reduce((s, v) => s + v, 0) / mesesExp.length : 0;
  const mesesRestantes = ritmoMensal > 0 && kgRestante > 0 ? kgRestante / ritmoMensal : (kgRestante === 0 ? 0 : null);

  // Receita (contrato) + saldo a faturar (Omie aFaturar da obra)
  const receitaTotal = receitas.reduce((s, r) => s + (r.valor || 0), 0);
  let faturadoOmie = null, aFaturarOmie = null;
  if (venda?.obras) { const o = venda.obras.find((x) => numKey(x.numeroOp) === numKey(op.numero)); if (o) { faturadoOmie = o.faturado || 0; aFaturarOmie = o.aFaturar || 0; } }

  // Custo de transformação: incorrido + projeção pelo avanço físico.
  // R$/kg é sobre o peso EXPEDIDO (lista) — número de aço real, não kg·setor.
  const custoIncorrido = transf.total;
  const rkgRealizado = expedido > 0 ? custoIncorrido / expedido : null;
  const custoRestante = rkgRealizado != null ? kgRestante * rkgRealizado : null;
  const custoTotalProj = custoRestante != null ? custoIncorrido + custoRestante : null;
  const resultadoProjetado = custoTotalProj != null && receitaTotal > 0 ? receitaTotal - custoTotalProj : null;
  // Break-even: quanto o restante pode custar por kg (saldo a faturar ÷ kg restante)
  const breakEven = kgRestante > 0 && aFaturarOmie != null ? aFaturarOmie / kgRestante : null;

  return NextResponse.json({
    op: { numero: op.numero, obra: op.obra, dataFimPrevista: op.dataFimPrevista },
    planejadoKg: planejado, expedidoKg: expedido, kgRestante, avanco,
    ritmoMensal, mesesRestantes,
    receitaTotal, faturadoOmie, aFaturarOmie,
    custoIncorrido, rkgRealizado, custoRestante, custoTotalProj, resultadoProjetado, breakEven,
    incompleto2025: transf.shareForaJanela > 0.1,
    semLista: planejado <= 0,
    omieOk: !!venda,
  });
}
