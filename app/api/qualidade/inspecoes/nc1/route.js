// GET — quais peças da OP têm arquivo NC1 (o do CNC).
//
// Vitor (21/08/2026): "como nós vamos usar o croqui de teste, traga eles no seletor para podermos
// escolher um deles para testarmos". O seletor precisa dizer quais peças têm NC1: com ele a
// dimensão de projeto sai exata (comprimento com duas casas e a posição de cada furo); sem ele,
// cai na leitura do desenho. Descobrir isso só na hora de montar seria ida e volta à toa.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { nc1DaOP } from "@/lib/relatorio-dimensional";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const opNumero = (url.searchParams.get("opNumero") || "").trim();
  if (!opNumero) return NextResponse.json({ marcas: [] });

  try {
    const mapa = await nc1DaOP(opNumero, url.searchParams.get("recarregar") === "1");
    return NextResponse.json({ marcas: [...mapa.keys()].sort() });
  } catch (e) {
    return NextResponse.json({ marcas: [], erro: e.message });
  }
}
