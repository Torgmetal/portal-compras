// GET /api/diretoria/contas?tipo=pagar|receber — listas detalhadas de títulos em
// aberto para as abas Contas a Pagar / a Receber do módulo Diretoria.
// Gate próprio (requireDiretoria) — independe de role; nem ADMIN entra sem liberação.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const maxDuration = 30;

const r2 = (n) => Math.round((n || 0) * 100) / 100;

export async function GET(req) {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const tipo = new URL(req.url).searchParams.get("tipo") === "receber" ? "receber" : "pagar";
  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const hoje = new Date(hojeIso + "T00:00:00.000Z");
  const venc = (d) => (d ? new Date(d) < hoje : false);

  if (tipo === "receber") {
    const rows = await prisma.contaReceber.findMany({
      where: { saldo: { gt: 0 }, status: { not: "CANCELADO" } },
      select: { id: true, clienteNome: true, valor: true, valorRecebido: true, saldo: true, dataVencimento: true, status: true, numeroDocumento: true, numeroDocFiscal: true, categoriaNome: true },
      orderBy: { dataVencimento: "asc" },
    });
    const itens = rows.map((c) => ({
      id: c.id, nome: c.clienteNome || "—", valor: r2(c.valor), saldo: r2(c.saldo),
      vencimento: c.dataVencimento, status: c.status, vencido: venc(c.dataVencimento),
      doc: c.numeroDocFiscal || c.numeroDocumento || "", categoria: c.categoriaNome || "",
    }));
    return NextResponse.json({ tipo, total: r2(itens.reduce((s, i) => s + i.saldo, 0)), qtd: itens.length, itens });
  }

  const rows = await prisma.contaPagar.findMany({
    where: { status: { notIn: ["PAGO", "CANCELADO", "LIQUIDADO"] } },
    select: { id: true, fornecedorNome: true, valor: true, valorPago: true, dataVencimento: true, status: true, numeroDocumento: true, numeroDocFiscal: true, categoriaNome: true },
    orderBy: { dataVencimento: "asc" },
  });
  const itens = rows
    .map((c) => ({
      id: c.id, nome: c.fornecedorNome || "—", valor: r2(c.valor), saldo: r2(Math.max(0, (c.valor || 0) - (c.valorPago || 0))),
      vencimento: c.dataVencimento, status: c.status, vencido: venc(c.dataVencimento),
      doc: c.numeroDocFiscal || c.numeroDocumento || "", categoria: c.categoriaNome || "",
    }))
    .filter((i) => i.saldo > 0.005);
  return NextResponse.json({ tipo, total: r2(itens.reduce((s, i) => s + i.saldo, 0)), qtd: itens.length, itens });
}
