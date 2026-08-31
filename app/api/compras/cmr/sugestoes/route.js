// GET ?campo=descricao|norma&q= — autocomplete do CMR (listas padrão + o que já foi lançado).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const sp = new URL(req.url).searchParams;
  const tipo = sp.get("campo") === "norma" ? "NORMA" : "DESCRICAO";
  const q = (sp.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ sugestoes: [] });

  const rows = await prisma.cmrReferencia.findMany({
    where: { tipo, valor: { contains: q, mode: "insensitive" } },
    orderBy: [{ usos: "desc" }, { valor: "asc" }],
    take: 15, select: { valor: true },
  });
  return NextResponse.json({ sugestoes: rows.map((r) => r.valor) });
}
