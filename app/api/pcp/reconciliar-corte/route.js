// POST /api/pcp/reconciliar-corte        — reconcilia a baixa do corte (Syneco → peças) AGORA, todas as OPs
// POST /api/pcp/reconciliar-corte?auto=1 — idem, mas com throttle (rede de segurança ao abrir telas de corte)
// Existe porque o cron da Vercel não roda de forma confiável; assim a Fila de
// Corte / Montagem / Status da obra ficam em dia sem depender do agendador.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { reconciliarSynecoCorte } from "@/lib/reconciliar-syneco-corte";

export const runtime = "nodejs";
export const maxDuration = 60;

let ultimaAuto = 0; // throttle em memória (por instância) para chamadas automáticas

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  // Chamada automática (ao abrir a tela): não roda mais de 1x a cada 5 min por instância
  if (new URL(req.url).searchParams.get("auto")) {
    const agora = Date.now();
    if (agora - ultimaAuto < 5 * 60 * 1000) return NextResponse.json({ ok: true, skipped: true });
    ultimaAuto = agora;
  }

  try {
    const r = await reconciliarSynecoCorte();
    await prisma.auditLog
      .create({ data: { userId: user.id, action: "RECONCILIAR_SYNECO_CORTE", entity: "PecaConjunto", entityId: "MANUAL", diff: r } })
      .catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[reconciliar-corte] erro:", e?.message);
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao reconciliar" }, { status: 500 });
  }
}
