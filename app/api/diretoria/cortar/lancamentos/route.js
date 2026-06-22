// GET /api/diretoria/cortar/lancamentos?categoria=NOME&de=&ate= — títulos a pagar
// EM ABERTO de uma categoria (saldo), por vencimento, com quebra por mês (porMes)
// pra ver onde concentra. Mesma forma de resposta do drill do DRE (reusa o
// componente). requireDiretoria.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const maxDuration = 30;
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const LIMITE = 400;

export async function GET(req) {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const sp = new URL(req.url).searchParams;
  const categoria = sp.get("categoria") || "";
  const reData = /^\d{4}-\d{2}-\d{2}$/;
  const de = reData.test(sp.get("de") || "") ? new Date(sp.get("de") + "T00:00:00.000Z") : null;
  const ate = reData.test(sp.get("ate") || "") ? new Date(sp.get("ate") + "T00:00:00.000Z") : null;
  const dentro = (d) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    if (de && t < de.getTime()) return false;
    if (ate && t > ate.getTime() + 86400000 - 1) return false;
    return true;
  };

  const rows = await prisma.contaPagar.findMany({
    where: { status: { notIn: ["PAGO", "CANCELADO", "LIQUIDADO"] } },
    select: { id: true, fornecedorNome: true, valor: true, valorPago: true, dataVencimento: true, numeroDocFiscal: true, numeroDocumento: true, categoriaNome: true },
  });
  const matched = rows
    .filter((c) => (((c.categoriaNome || "").trim()) || "(sem categoria)") === categoria)
    .map((c) => ({ id: c.id, nome: c.fornecedorNome || "—", valor: Math.max(0, (c.valor || 0) - (c.valorPago || 0)), doc: c.numeroDocFiscal || c.numeroDocumento || "", data: c.dataVencimento, categoria: (c.categoriaNome || "").trim() || "(sem categoria)" }))
    .filter((i) => i.valor > 0.005);

  const porMesMap = new Map();
  for (const it of matched) {
    const k = it.data ? new Date(it.data).toISOString().slice(0, 7) : "—";
    const e = porMesMap.get(k) || { valor: 0, qtd: 0 };
    e.valor += it.valor; e.qtd++; porMesMap.set(k, e);
  }
  const porMes = [...porMesMap.entries()].map(([mes, e]) => ({ mes, valor: r2(e.valor), qtd: e.qtd })).sort((a, b) => a.mes.localeCompare(b.mes));

  const filtrados = (de || ate) ? matched.filter((i) => dentro(i.data)) : matched;
  filtrados.sort((a, b) => b.valor - a.valor);
  return NextResponse.json({
    total: r2(filtrados.reduce((s, i) => s + i.valor, 0)), qtd: filtrados.length,
    totalJanela: r2(matched.reduce((s, i) => s + i.valor, 0)),
    porMes, itens: filtrados.slice(0, LIMITE).map((i) => ({ ...i, valor: r2(i.valor) })),
  });
}
