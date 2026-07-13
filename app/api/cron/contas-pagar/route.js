// Cron Vercel — sync incremental das Contas a Pagar do Omie (só o que mudou).
// Roda a cada 30 min (vercel.json). Auth via header vercel-cron ou CRON_SECRET.
// Também serve para o botão "Atualizar" da tela (via fetch autenticado por sessão).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { temCronSecret } from "@/lib/cron-auth";
import { sincronizarContasPagar } from "@/lib/omie-contas-pagar";

export const runtime = "nodejs";
export const maxDuration = 60;

async function autorizado(req) {
  if (temCronSecret(req)) return true; // cron da Vercel (Bearer CRON_SECRET)
  // Usuário logado do financeiro também pode disparar (botão Atualizar)
  try { await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]); return true; } catch { return false; }
}

export async function GET(req) {
  if (!(await autorizado(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const r = await sincronizarContasPagar({ incremental: true, maxDetalhe: 80 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron contas-pagar] erro:", e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
