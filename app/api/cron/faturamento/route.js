// Cron Vercel — atualiza o cache de Faturamento por obra (consulta o Omie).
// Roda 1x/dia (config em vercel.json). Auth via header vercel-cron ou CRON_SECRET.
import { NextResponse } from "next/server";
import { atualizarCacheFaturamento } from "@/lib/faturamento-cache";
import { registrarExecucao } from "@/lib/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  const ua = req.headers.get("user-agent") || "";
  const isCron = ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const data = await atualizarCacheFaturamento();
    await registrarExecucao("faturamento", { ok: true, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, totalObras: data.totalObras, atualizadoEm: data.atualizadoEm });
  } catch (e) {
    console.error("[cron faturamento] erro:", e?.message);
    await registrarExecucao("faturamento", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
