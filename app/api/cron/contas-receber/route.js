// Cron Vercel — sync incremental das Contas a Receber do Omie (só o que mudou).
// Roda 1x/dia (vercel.json — plano Hobby). Auth via header vercel-cron ou
// CRON_SECRET. Também serve para o botão "Atualizar" da tela (sessão).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { temCronSecret } from "@/lib/cron-auth";
import { sincronizarContasReceber } from "@/lib/omie-contas-receber";

export const runtime = "nodejs";
export const maxDuration = 60;

async function autorizado(req) {
  if (temCronSecret(req)) return true; // cron da Vercel (Bearer CRON_SECRET)
  try { await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]); return true; } catch { return false; }
}

export async function GET(req) {
  if (!(await autorizado(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const r = await sincronizarContasReceber({ orcamentoMs: 40000 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron contas-receber] erro:", e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
