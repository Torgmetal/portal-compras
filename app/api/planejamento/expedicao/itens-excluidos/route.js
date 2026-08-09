// Termos de itens que NÃO contam como estrutura no % de expedição do cronograma
// (grade de piso, telha, parafuso, lanternim, steel deck…). Editável pelo time.
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

async function listar() {
  const rows = await prisma.$queryRawUnsafe(`SELECT id, termo FROM "ExpedicaoItemExcluido" ORDER BY termo`);
  return rows;
}

export async function GET() {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "EXPEDICAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  try {
    return NextResponse.json({ termos: await listar() });
  } catch {
    return NextResponse.json({ termos: [] }); // tabela ainda não existe
  }
}

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO", "EXPEDICAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const termo = String((await req.json().catch(() => ({})))?.termo || "").trim();
  if (termo.length < 2) return NextResponse.json({ error: "Informe um termo (mín. 2 letras)." }, { status: 400 });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ExpedicaoItemExcluido" ("id","termo","criadoPorId") VALUES ($1,$2,$3) ON CONFLICT (lower("termo")) DO NOTHING`,
    crypto.randomUUID(), termo, user.id || null,
  );
  return NextResponse.json({ termos: await listar() });
}

export async function DELETE(req) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "EXPEDICAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  await prisma.$executeRawUnsafe(`DELETE FROM "ExpedicaoItemExcluido" WHERE id = $1`, id);
  return NextResponse.json({ termos: await listar() });
}
