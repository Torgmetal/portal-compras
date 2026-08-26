// Indicador ISO do PCP — série mensal + acumulado do ano, do dado real do portal.
// Cálculo em lib/indicadores-pcp-iso.js (reusado pelo PDF), no padrão dos outros setores.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { indicadoresPcpIso } from "@/lib/indicadores-pcp-iso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try { await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const hoje = new Date();
  const ano = parseInt(url.searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  let mes = parseInt(url.searchParams.get("mes") ?? "", 10);
  if (Number.isNaN(mes) || mes < 0 || mes > 11) mes = ano === hoje.getUTCFullYear() ? hoje.getUTCMonth() : 11;
  const mesFim = ano < hoje.getUTCFullYear() ? 11 : hoje.getUTCMonth();

  const { indicadores, detalhe } = await indicadoresPcpIso(prisma, ano);
  const out = indicadores.map((ind) => ({ ...ind, atual: ind.serie[mes] ?? null }));
  // ⚠ o detalhe vai junto: um indicador da ISO sem poder abrir "quais lotes" é número de parede.
  // Quem vê 72% precisa chegar em qual dia e qual frente ficou para trás, sem outra consulta.
  return NextResponse.json({ ano, mes, mesFim, indicadores: out, detalhe: detalhe.filter((d) => new Date(`${d.dia}T12:00:00Z`).getUTCMonth() === mes) });
}
