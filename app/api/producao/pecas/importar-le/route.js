// POST /api/producao/pecas/importar-le
// Recebe { rows: [...] } parseado no client (evita limite 4.5MB do Vercel)
// e { opNumero?: string } pra forcar a OP caso o cabecalho nao tenha.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { importarLeRows } from "@/lib/importar-le-core";

export const runtime = "nodejs";
export const maxDuration = 300; // LE grande faz upsert peca a peca; 60s estourava (timeout -> HTML/504)

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "EXPEDICAO", "ENGENHARIA", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { rows, opNumero: opForcada, sobrescrever } = body;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Envie 'rows' como array da planilha parseada" }, { status: 400 });
  }

  try {
    return NextResponse.json(await importarLeRows(rows, { opNumero: opForcada || null, sobrescrever, userId: user.id }));
  } catch (e) {
    if (e.status === 400) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
