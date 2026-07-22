// POST — reordena os desenhos. Body { ordem: [desenhoId, ...] } → ordem = pos+1.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"];

export async function POST(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ordem) ? body.ordem.filter((x) => typeof x === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "Ordem vazia." }, { status: 400 });
  await prisma.$transaction(ids.map((id, i) => prisma.desenhoOP.updateMany({ where: { id, opId: params.id }, data: { ordem: i + 1 } })));
  return NextResponse.json({ success: true });
}
