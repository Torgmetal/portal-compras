// Cron Vercel — sincroniza movimentacoes do Omie (entradas + saidas)
// dos ultimos 2 dias. Roda 1x/hora.
import { NextResponse } from "next/server";
import { sincronizarMovimentacoes } from "@/lib/omie-estoque";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  const ua = req.headers.get("user-agent") || "";
  const isCron = ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const r = await sincronizarMovimentacoes(2);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron estoque-mov] erro:", e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
