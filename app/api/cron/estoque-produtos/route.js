// Cron Vercel — sincroniza produtos do Omie das categorias configuradas.
// Roda 1x/hora (config em vercel.json). Autenticacao via header Vercel-Cron.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { sincronizarProdutos } from "@/lib/omie-estoque";
import { registrarExecucao } from "@/lib/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  // Só autoriza com Bearer CRON_SECRET (a Vercel injeta nas invocações de cron).
  // NÃO confia no User-Agent — é spoofável (SEC-01).
  const isCron = temCronSecret(req);
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const r = await sincronizarProdutos();
    await registrarExecucao("estoque-produtos", { ok: true, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron estoque-produtos] erro:", e?.message);
    await registrarExecucao("estoque-produtos", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
