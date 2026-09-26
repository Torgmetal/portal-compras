// POST /api/estoque/sync — dispara sincronizacao completa do Omie.
// Body: { produtos?: boolean, movimentacoes?: boolean, diasAtras?: number }
// Defaults: produtos=true, movimentacoes=true, diasAtras=7
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { sincronizarProdutos } from "@/lib/omie-estoque";
import { sincronizarMovimentacoes } from "@/lib/omie-estoque-movimentos";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const t0 = Date.now();
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
      // ⚠ Os produtos vêm antes e podem gastar quase todo o `maxDuration`: com prazo, o que sobrar
      // vira "tempo esgotado" na tela, em vez de a Vercel matar a rota no meio.
      resultado.movimentacoes = await sincronizarMovimentacoes(diasAtras, { ateMs: t0 + 55_000 });
    } catch (e) {
      resultado.movimentacoes = { error: String(e?.message || e) };
    }
  }

  return NextResponse.json({ ok: true, ...resultado });
}
