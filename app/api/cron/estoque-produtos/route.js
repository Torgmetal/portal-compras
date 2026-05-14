// Cron Vercel — sincroniza produtos do Omie das categorias configuradas.
// Roda 1x/hora (config em vercel.json). Autenticacao via header Vercel-Cron.
import { NextResponse } from "next/server";
import { sincronizarProdutos } from "@/lib/omie-estoque";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  // Vercel envia header "user-agent: vercel-cron/1.0" e tambem "x-vercel-signature"
  // Pra simplicidade aceitamos requisicao se vier do user-agent vercel-cron OU
  // se Authorization Bearer == CRON_SECRET
  const auth = req.headers.get("authorization") || "";
  const ua = req.headers.get("user-agent") || "";
  const isCron = ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const r = await sincronizarProdutos();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron estoque-produtos] erro:", e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
