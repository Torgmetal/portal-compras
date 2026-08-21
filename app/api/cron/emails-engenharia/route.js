// Cron Vercel — sincroniza as caixas da Engenharia (MS Graph Mail) via delta query.
// Fase 1: ingestão crua (grava ObraEmailEvento). Config em vercel.json.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { sincronizarEmailsEngenharia } from "@/lib/ingest-emails-engenharia";
import { casarEmailsPendentes } from "@/lib/match-email-op";
import { classificarMarcosIA } from "@/lib/classificar-email-ia";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";

export const runtime = "nodejs";
export const maxDuration = 300; // 1ª carga puxa histórico em blocos; dá folga

export async function GET(req) {
  const isCron = temCronSecret(req);
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const r = await sincronizarEmailsEngenharia();
    const match = await casarEmailsPendentes().catch((e) => ({ erro: e.message }));
    const ia = await classificarMarcosIA().catch((e) => ({ erro: e.message }));
    await registrarExecucao("emails-engenharia", { ok: true, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, ...r, match, ia });
  } catch (e) {
    console.error("[cron emails-engenharia] erro:", e?.message);
    await registrarExecucao("emails-engenharia", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
