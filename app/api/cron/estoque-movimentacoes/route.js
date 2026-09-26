// Cron Vercel — sincroniza movimentacoes do Omie (entradas + saidas)
// dos ultimos 2 dias. Roda 1x/hora.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { sincronizarMovimentacoes, resumoDaSincronizacao } from "@/lib/omie-estoque-movimentos";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { log } from "@/lib/log";

const registro = log("api/cron/estoque-movimentacoes");

export const runtime = "nodejs";
export const maxDuration = 60;

// ⚠⚠ O PRAZO DA SINCRONIZAÇÃO CABE NO `maxDuration`, COM FOLGA PARA BATER O PONTO. Morta por timeout
// da Vercel, a função não chega ao `catch` e o monitor fica sem registro — a falha voltaria a ser
// invisível, que é exatamente o defeito que esta rota teve até 24/09/2026 (ver
// lib/omie-estoque-movimentos.js). 15 s sobram para o `registrarExecucao`, que retenta ~9 s.
const PRAZO_MS = 45_000;

export async function GET(req) {
  // Só Bearer CRON_SECRET (User-Agent é spoofável — SEC-01).
  const isCron = temCronSecret(req);
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    await aquecerBanco(prisma); // acorda o Neon (scale-to-zero) antes do 1º query
    const r = await sincronizarMovimentacoes(2, { ateMs: t0 + PRAZO_MS });
    await registrarExecucao("estoque-movimentacoes", { ok: true, mensagem: resumoDaSincronizacao(r), duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    registro.erro("[cron estoque-mov] erro:", e?.message);
    await registrarExecucao("estoque-movimentacoes", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message, ...(e?.resumo && { resumo: e.resumo }) }, { status: 500 });
  }
}
