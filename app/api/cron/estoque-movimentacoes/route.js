// Cron Vercel — sincroniza movimentacoes do Omie (entradas + saidas)
// dos ultimos 2 dias. Roda 1x/hora.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { sincronizarMovimentacoes } from "@/lib/omie-estoque";
import { registrarExecucao } from "@/lib/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  // Só Bearer CRON_SECRET (User-Agent é spoofável — SEC-01).
  const isCron = temCronSecret(req);
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const r = await sincronizarMovimentacoes(2);
    await registrarExecucao("estoque-movimentacoes", { ok: true, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron estoque-mov] erro:", e?.message);
    await registrarExecucao("estoque-movimentacoes", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
