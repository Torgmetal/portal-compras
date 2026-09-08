// GET /api/pcp/baixa-syneco?op=067&setor=CORTE&ids=a,b,c
// → a lista das marcas selecionadas para dar baixa NO SYNECO (o portal não baixa nada).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { listaBaixaSyneco } from "@/lib/baixa-syneco";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const u = new URL(req.url);
  const op = String(u.searchParams.get("op") || "").trim();
  const setor = String(u.searchParams.get("setor") || "").trim().toUpperCase();
  // ⚠ teto no número de ids: a barra manda o lote, mas nada impede montar a URL na mão.
  const ids = String(u.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5000);
  if (!op) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  try { return NextResponse.json(await listaBaixaSyneco(op, setor, ids)); }
  catch (e) { return NextResponse.json({ error: e.message || "Falha ao montar a lista" }, { status: 400 }); }
}
