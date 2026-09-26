// POST /api/estoque/sync — dispara sincronizacao completa do Omie.
// Body: { produtos?: boolean, movimentacoes?: boolean, diasAtras?: number }
// Defaults: produtos=true, movimentacoes=true, diasAtras=7
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { sincronizarProdutos, sincronizarMovimentacoes } from "@/lib/omie-estoque";

export const runtime = "nodejs";
// ⚠ 300 s: os produtos sozinhos passam de 60 s (ver app/api/cron/estoque-produtos/route.js, 26/09/2026).
export const maxDuration = 300;

export async function POST(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const fazProdutos = body.produtos !== false;
  const fazMovs = body.movimentacoes !== false;
  const diasAtras = Number(body.diasAtras) || 7;

  const resultado = {};
  if (fazProdutos) {
    try {
      resultado.produtos = await sincronizarProdutos();
    } catch (e) {
      resultado.produtos = { error: String(e?.message || e) };
    }
  }
  if (fazMovs) {
    try {
      resultado.movimentacoes = await sincronizarMovimentacoes(diasAtras);
    } catch (e) {
      resultado.movimentacoes = { error: String(e?.message || e) };
    }
  }

  return NextResponse.json({ ok: true, ...resultado });
}
