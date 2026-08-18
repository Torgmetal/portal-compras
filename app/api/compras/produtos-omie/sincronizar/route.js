// Sincroniza o CADASTRO DE PRODUTOS do Omie pro cache local (ProdutoOmie).
// POST = botão "Atualizar produtos"; GET = cron semanal (CRON_SECRET).
// O portal só conhecia os itens que já passaram por uma RM (~190 de 2.4k) — perfis existentes no
// Omie apareciam "sem código" no romaneio de terceiro. (Vitor 18/08.)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sincronizarProdutosOmie } from "@/lib/omie-produtos";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST() {
  let user;
  try { user = await requireRole(["ADMIN", "COMPRAS", "PCP", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  try {
    const r = await sincronizarProdutosOmie();
    await prisma.auditLog.create({ data: { userId: user.id, action: "SINCRONIZAR_PRODUTOS_OMIE", entity: "ProdutoOmie", entityId: String(r.gravados), diff: r } }).catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Falha ao sincronizar produtos do Omie" }, { status: 502 });
  }
}

export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  try { return NextResponse.json({ ok: true, ...(await sincronizarProdutosOmie()) }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
