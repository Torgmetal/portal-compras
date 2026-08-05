// GET /api/compras/indicadores/iso/detalhe?indicador=&ano=&mes=
// Registros do MÊS que compõem um indicador ISO de Compras (auditoria — de onde saiu
// o número). Retorna { titulo, colunas, linhas, resumo }.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcularIQF } from "@/lib/iqf-fornecedores";

export const runtime = "nodejs";

const MS = 86400000;
const diasUteis = (a, b) => {
  const d0 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const d1 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  let n = Math.round((d1 - d0) / MS);
  if (n <= 0) return 0;
  n = Math.min(n, 400);
  let c = 0;
  for (let i = 1; i <= n; i++) { const w = new Date(d0 + i * MS).getUTCDay(); if (w !== 0 && w !== 6) c++; }
  return c;
};
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtBRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMPRAS"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const indicador = url.searchParams.get("indicador") || "";
  const hoje = new Date();
  const ano = parseInt(url.searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  let mes = parseInt(url.searchParams.get("mes") ?? "", 10);
  if (Number.isNaN(mes) || mes < 0 || mes > 11) mes = hoje.getUTCMonth();
  const mIni = new Date(Date.UTC(ano, mes, 1)), mFim = new Date(Date.UTC(ano, mes + 1, 1));

  // ── Retorno de Orçamento: cotações respondidas no mês (base da média de dias) ──
  if (indicador === "retorno_orcamento") {
    const cot = await prisma.cotacao.findMany({
      where: { recebidaEm: { gte: mIni, lt: mFim } },
      select: { fornecedorNome: true, fornecedor: { select: { razaoSocial: true } }, createdAt: true, recebidaEm: true, rm: { select: { numero: true, op: { select: { numero: true } } } } },
      orderBy: { recebidaEm: "asc" },
    });
    const linhas = cot.map((c) => [
      c.fornecedor?.razaoSocial || c.fornecedorNome || "—",
      c.rm ? `${c.rm.numero || "—"}${c.rm.op?.numero ? ` · OP-${c.rm.op.numero}` : ""}` : "—",
      fmtD(c.createdAt), fmtD(c.recebidaEm), `${diasUteis(c.createdAt, c.recebidaEm)} d.ú.`,
    ]);
    const dias = cot.map((c) => diasUteis(c.createdAt, c.recebidaEm));
    const media = dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : null;
    return NextResponse.json({
      titulo: "Retorno de Orçamento", colunas: ["Fornecedor", "RM / OP", "Enviada", "Respondida", "Dias úteis"],
      linhas, resumo: `${cot.length} cotação(ões) respondida(s) · média ${media != null ? (Math.round(media * 10) / 10).toString().replace(".", ",") : "—"} dias úteis`,
    });
  }

  // ── Compras nível "B": compras do mês por fornecedor + IQF (conta ou não) ──
  if (indicador === "compras_fornecedor_b") {
    const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
    const { fornecedores } = await calcularIQF(prisma, { yIni, yFim });
    const doMes = fornecedores
      .map((f) => ({ nome: f.nome, valor: (f.comprasMes || [])[mes] || 0, iqf: f.iqf, nivelB: f.iqf != null && f.iqf >= 75 }))
      .filter((f) => f.valor > 0)
      .sort((a, b) => b.valor - a.valor);
    const linhas = doMes.map((f) => [f.nome, fmtBRL(f.valor), f.iqf == null ? "—" : String(f.iqf), f.nivelB ? "Sim" : "Não"]);
    const total = doMes.reduce((s, f) => s + f.valor, 0);
    const nb = doMes.filter((f) => f.nivelB).reduce((s, f) => s + f.valor, 0);
    return NextResponse.json({
      titulo: "Compras de fornecedores nível B", colunas: ["Fornecedor", "Valor no mês", "IQF", "Nível B (≥75)"],
      linhas, resumo: `${fmtBRL(total)} comprado · ${total > 0 ? Math.round((nb / total) * 100) : 0}% com fornecedor nível B`,
    });
  }

  return NextResponse.json({ error: "Este indicador ainda não tem detalhamento." }, { status: 404 });
}
