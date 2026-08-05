// Indicadores ISO de COMPRAS — calcula os indicadores de Compras da planilha ISO
// (INDICADORES DA QUALIDADE_ACOMPANHAMENTO) a partir do dado real do portal. Mesma
// estrutura do painel ISO da Qualidade, mas só o processo COMPRAS e acessível a
// Compras. Ver lib/indicadores-iso.js. Retorno de Orçamento é auto; Compras nível "B"
// (IQF) fica "pendente" até existir avaliação de fornecedores.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { INDICADORES_ISO } from "@/lib/indicadores-iso";

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
const arr12 = () => Array.from({ length: 12 }, () => null);

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMPRAS"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const hoje = new Date();
  const ano = parseInt(url.searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  let mes = parseInt(url.searchParams.get("mes") ?? "", 10);
  if (Number.isNaN(mes) || mes < 0 || mes > 11) mes = ano === hoje.getUTCFullYear() ? hoje.getUTCMonth() : 11;
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const mesFim = ano < hoje.getUTCFullYear() ? 11 : hoje.getUTCMonth();

  const series = {}; // id -> [12]

  // Retorno de Orçamento — média de dias úteis da cotação (solicitação → resposta do
  // fornecedor), por mês do recebimento. Meta ≤ 4 dias úteis.
  { const cot = await prisma.cotacao.findMany({ where: { recebidaEm: { gte: yIni, lt: yFim } }, select: { createdAt: true, recebidaEm: true } });
    const soma = arr12(), n = arr12();
    for (const c of cot) { const m = c.recebidaEm.getUTCMonth(); soma[m] = (soma[m] || 0) + diasUteis(c.createdAt, c.recebidaEm); n[m] = (n[m] || 0) + 1; }
    series.retorno_orcamento = soma.map((v, m) => (n[m] ? Math.round((v / n[m]) * 10) / 10 : null)); }

  // compras_fornecedor_b (IQF ≥ 75%) — pendente: depende de avaliação/qualificação de
  // fornecedores, que ainda não existe no portal. Fica sem série ("aguardando registro").

  const indicadores = INDICADORES_ISO.filter((i) => i.processo === "COMPRAS").map((ind) => {
    const serie = series[ind.id] || arr12();
    const atual = serie[mes] ?? null;
    return { ...ind, serie, atual };
  });

  return NextResponse.json({ ano, mes, mesFim, indicadores });
}
