// Cron Vercel — reaprende as regras de IBS/CBS das NF-e de saída do ano (lib/fiscal/coleta-ibs-cbs).
// ⚠ RECONSTRÓI, não soma: é o mesmo que o botão "Atualizar regras das NFs" faz. Somar a janela de
// ontem contava de novo as notas que a última reconstrução já tinha contado (achado do Codex, 28/09/2026).
import { NextResponse } from "next/server";
import { prisma, prismaDirect } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { registrarExecucao } from "@/lib/cron-monitor";
import { temCronSecret } from "@/lib/cron-auth";
import { reconstruirRegras } from "@/lib/fiscal/coleta-ibs-cbs";
import { log } from "@/lib/log";

const registro = log("api/cron/fiscal-ibs-cbs");
export const runtime = "nodejs";
// ⚠ O ano inteiro, mês a mês, com o backoff do Omie — mesmo teto do botão.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const { notas, regras } = await reconstruirRegras({ db: prismaDirect });
    const mensagem = `${notas} NF(s) no ano · ${regras} regra(s)`;
    await registrarExecucao("fiscal-ibs-cbs", { ok: true, mensagem, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, notas, regras });
  } catch (e) {
    registro.erro("[cron fiscal-ibs-cbs] erro:", e?.message);
    await registrarExecucao("fiscal-ibs-cbs", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
