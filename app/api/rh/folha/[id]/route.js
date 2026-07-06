// DELETE /api/rh/folha/[id] → exclui a folha de uma competência (cascata nos
// itens), p/ o RH refazer caso tenha iniciado errada. Bloqueia se FECHADA
// (reabra antes). Só ADMIN/RH.
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

  const folha = await prisma.folhaCompetencia.findUnique({ where: { id: params.id }, select: { id: true, competencia: true, status: true } });
  if (!folha) return NextResponse.json({ success: false, error: "Competência não encontrada" }, { status: 404 });
  if (folha.status === "FECHADA") return NextResponse.json({ success: false, error: "Folha fechada — reabra antes de excluir." }, { status: 409 });

  await prisma.folhaCompetencia.delete({ where: { id: folha.id } }); // cascade → FolhaItem

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EXCLUIR_FOLHA", entity: "FolhaCompetencia", entityId: folha.id, diff: { competencia: folha.competencia } },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
