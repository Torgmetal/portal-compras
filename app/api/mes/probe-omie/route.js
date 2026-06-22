import { NextResponse } from "next/server";
import { importarFluxoExtrato } from "@/lib/omie-extrato";

// SONDA TEMPORARIA — testa o import do extrato Omie -> FluxoCaixa (janela curta).
// Sob /api/mes/ (middleware libera Bearer). Auth: Bearer MES_SYNC_API_KEY.
// Remover apos validar.

export const maxDuration = 60;

function isoHoje(off = 0) {
  return new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);
}

export async function GET(req) {
  if ((req.headers.get("authorization") || "").slice(7) !== process.env.MES_SYNC_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const de  = searchParams.get("de")  || isoHoje(-7);
  const ate = searchParams.get("ate") || isoHoje(0);
  try {
    const r = await importarFluxoExtrato({ de, ate, userId: null });
    return NextResponse.json({ periodo: { de, ate }, ...r });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
