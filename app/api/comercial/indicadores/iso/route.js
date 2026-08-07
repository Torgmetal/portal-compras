// Indicadores ISO do Comercial (Vendas) — série mensal + acumulado do ano, LIDOS da planilha
// RELATÓRIO_PROPOSTAS do SharePoint (lib/indicadores-comercial-iso.js). Acesso ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { indicadoresComercialIso } from "@/lib/indicadores-comercial-iso";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const hoje = new Date();
  const ano = parseInt(url.searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  let mes = parseInt(url.searchParams.get("mes") ?? "", 10);
  if (Number.isNaN(mes) || mes < 0 || mes > 11) mes = ano === hoje.getUTCFullYear() ? hoje.getUTCMonth() : 11;
  const mesFim = ano < hoje.getUTCFullYear() ? 11 : hoje.getUTCMonth();

  const { indicadores } = await indicadoresComercialIso(ano);
  const out = indicadores.map((ind) => ({ ...ind, atual: ind.serie[mes] ?? null }));
  return NextResponse.json({ ano, mes, mesFim, indicadores: out });
}
