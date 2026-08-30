// GET  /api/engenharia/listas/le-servidor?op=105  → as LEs dessa OP no servidor
// POST { op, itemId }                             → carrega essa LE no portal
//
// ⚠⚠ SÓ ADMIN. Vitor (29/08/2026): "sobre o botão da lista deixar apenas para os admin". Carregar
// lista mexe nas peças da obra — o que a fábrica corta, o que a expedição embarca e o peso que o
// financeiro fatura. Os botões de importação por upload continuam com os perfis de sempre; este,
// que puxa direto do servidor sem ninguém conferir o arquivo antes, não.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { lesDaOp, linhasDaLe } from "@/lib/le-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const status = (e) => (e.message === "Unauthorized" ? 401 : 403);

export async function GET(req) {
  try { await requireRole(["ADMIN"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: status(e) }); }

  const op = new URL(req.url).searchParams.get("op");
  if (!op) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  try {
    const r = await lesDaOp(op);
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Falha ao ler o servidor." }, { status: 502 });
  }
}

export async function POST(req) {
  try { await requireRole(["ADMIN"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: status(e) }); }

  const body = await req.json().catch(() => ({}));
  if (!body?.itemId) return NextResponse.json({ error: "Escolha o arquivo." }, { status: 400 });

  let rows;
  try { rows = await linhasDaLe(body.itemId); }
  catch (e) { return NextResponse.json({ error: e?.message || "Falha ao ler o arquivo." }, { status: 502 }); }
  if (!rows?.length) return NextResponse.json({ error: "A planilha veio vazia." }, { status: 422 });

  // ⚠ devolve as LINHAS para a tela mandar ao import de sempre (/api/producao/pecas/importar-le),
  // que é quem resolve a OP, faz o upsert por marca e grava o AuditLog. Um segundo caminho de
  // gravação divergiria do primeiro na próxima correção.
  return NextResponse.json({ success: true, rows, linhas: rows.length });
}
