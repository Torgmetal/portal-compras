// DELETE /api/rh/ponto/[id] → exclui a importação de ponto de uma competência
// (cascata nos itens), p/ o RH reimportar caso tenha subido errado. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const ponto = await prisma.pontoCompetencia.findUnique({ where: { id: params.id }, select: { id: true, competencia: true } });
  if (!ponto) return NextResponse.json({ success: false, error: "Competência não encontrada" }, { status: 404 });

  await prisma.pontoCompetencia.delete({ where: { id: ponto.id } }); // cascade → PontoItem

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EXCLUIR_PONTO_IMPORTACAO", entity: "PontoCompetencia", entityId: ponto.id, diff: { competencia: ponto.competencia } },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
