// Indicadores ISO de PRODUÇÃO — série mensal + acumulado do ano, do dado real do portal.
// Cálculo em lib/indicadores-producao-iso.js (reusado pelo PDF). Acesso ADMIN/PRODUCAO.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { indicadoresProducaoIso } from "@/lib/indicadores-producao-iso";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(["ADMIN", "PRODUCAO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const hoje = new Date();
  const ano = parseInt(url.searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  let mes = parseInt(url.searchParams.get("mes") ?? "", 10);
  if (Number.isNaN(mes) || mes < 0 || mes > 11) mes = ano === hoje.getUTCFullYear() ? hoje.getUTCMonth() : 11;
  const mesFim = ano < hoje.getUTCFullYear() ? 11 : hoje.getUTCMonth();

  const { indicadores } = await indicadoresProducaoIso(prisma, ano);
  const out = indicadores.map((ind) => ({ ...ind, atual: ind.serie[mes] ?? null }));
  return NextResponse.json({ ano, mes, mesFim, indicadores: out });
}
