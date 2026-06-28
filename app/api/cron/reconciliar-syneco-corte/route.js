// Cron Vercel — baixa automática do corte: reconcilia o produzido do Syneco nas
// peças LPC ativas (qteProduzida/status), pra Fila de Corte, Montagem e relatórios
// ficarem em dia sem ninguém rodar o "Importar Syneco" à mão. Carimbo no AuditLog
// (action RECONCILIAR_SYNECO_AUTO) — lido pelo painel do PCP ("última baixa").
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reconciliarSynecoCorte } from "@/lib/reconciliar-syneco-corte";
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
    const r = await reconciliarSynecoCorte();
    // Carimbo (sempre grava, mesmo com 0 mudanças — é o "rodou às HH:MM" do painel).
    await prisma.auditLog
      .create({ data: { userId: null, action: "RECONCILIAR_SYNECO_AUTO", entity: "PecaConjunto", entityId: "CRON", diff: r } })
      .catch(() => {});
    await registrarExecucao("reconciliar-syneco-corte", { ok: true, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron reconciliar-syneco-corte] erro:", e?.message);
    await registrarExecucao("reconciliar-syneco-corte", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
