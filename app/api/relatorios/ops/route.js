// GET /api/relatorios/ops — OPs para o seletor do relatório (autopreenche cliente/obra).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MODS_RELATORIOS } from "@/lib/relatorios";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(MODS_RELATORIOS); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ops = await prisma.oP.findMany({
    orderBy: { createdAt: "desc" },
    take: 800,
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  return NextResponse.json({ success: true, ops });
}
