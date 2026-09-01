// GET /api/compras/cmr/exclusoes — log de lançamentos CMR excluídos (quem, quando, o quê).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];

export async function GET() {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const logs = await prisma.auditLog.findMany({
    where: { action: "CMR_EXCLUIR" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, createdAt: true, diff: true, user: { select: { name: true } } },
  });
  const itens = logs.map((l) => ({
    id: l.id,
    quando: l.createdAt,
    usuario: l.user?.name || "—",
    indiceR: l.diff?.importRef || "—",
    nome: l.diff?.nome || "—",
    fornecedor: l.diff?.fornecedor || null,
    nf: l.diff?.nf || null,
    obra: l.diff?.obra || null,
  }));
  return NextResponse.json({ success: true, itens });
}
