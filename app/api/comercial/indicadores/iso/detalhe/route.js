// GET /api/comercial/indicadores/iso/detalhe?indicador=&ano= — componentes mensais (da planilha)
// que compõem o indicador ISO do Comercial. Acesso ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { detalheComercialIso } from "@/lib/indicadores-comercial-iso";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const indicador = url.searchParams.get("indicador") || "";
  const hoje = new Date();
  const ano = parseInt(url.searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  const mesFim = ano < hoje.getUTCFullYear() ? 11 : hoje.getUTCMonth();

  const det = await detalheComercialIso(ano, indicador, mesFim);
  if (!det) return NextResponse.json({ error: "Este indicador ainda não tem detalhamento (ou a planilha não pôde ser lida)." }, { status: 404 });
  return NextResponse.json(det);
}
