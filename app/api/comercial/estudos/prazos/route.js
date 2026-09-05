// GET /api/comercial/estudos/prazos — o ritmo medido da casa, para o cronograma prévio do estudo.
// Só leitura, com cache de 6h em lib/prazos-historicos. `?recarregar=1` refaz a medição.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { mediasDePrazo } from "@/lib/prazos-historicos";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  try {
    const forcar = new URL(req.url).searchParams.get("recarregar") === "1";
    return NextResponse.json(await mediasDePrazo({ forcar }));
  } catch (e) {
    return NextResponse.json({ error: e?.message || "erro" }, { status: 500 });
  }
}
