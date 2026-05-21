// POST /api/admin/usuarios/[id]/ativar
// Reativa um usuário previamente desativado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function POST(_req, { params }) {
  let adminUser;
  try {
    adminUser = await requireRole(["ADMIN"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const alvoId = params.id;

  const usuario = await prisma.user.findUnique({ where: { id: alvoId } });
  if (!usuario) {
    return NextResponse.json({ success: false, error: "Usuário não encontrado." }, { status: 404 });
  }

  if (usuario.ativo) {
    return NextResponse.json({ success: false, error: "Usuário já está ativo." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: alvoId },
    data:  { ativo: true },
  });

  // [admin-usuarios] Audit: reativação de usuário
  await prisma.auditLog.create({
    data: {
      userId:   adminUser.id,
      action:   "admin_ativar_usuario",
      entity:   "User",
      entityId: alvoId,
      diff:     { emailAlvo: usuario.email, ativo: { antes: false, depois: true } },
    },
  });

  return NextResponse.json({ success: true, data: { id: alvoId, ativo: true } });
}
