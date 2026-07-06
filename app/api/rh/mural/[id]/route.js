// DELETE /api/rh/mural/[id] — remove um aviso do mural. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const aviso = await prisma.muralAviso.findUnique({ where: { id: params.id }, select: { id: true, titulo: true } });
  if (!aviso) return NextResponse.json({ success: false, error: "Aviso não encontrado" }, { status: 404 });

  await prisma.muralAviso.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "EXCLUIR_MURAL_AVISO", entity: "MuralAviso", entityId: params.id, diff: { titulo: aviso.titulo } },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
