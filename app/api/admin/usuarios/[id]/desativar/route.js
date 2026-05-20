// POST /api/admin/usuarios/[id]/desativar
// Soft-delete: marca ativo=false. Nunca apaga o registro (preserva histórico).
// Proteção anti-suicídio: ADMIN não pode desativar a própria conta.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function POST(_req, { params }) {
  let adminUser;
  try {
    adminUser = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ success: false, error: "Apenas ADMIN." }, { status: 403 });
  }

  const alvoId = params.id;

  // ── Proteção anti-suicídio ────────────────────────────────────────────────
  if (adminUser.id === alvoId) {
    return NextResponse.json(
      { success: false, error: "Você não pode desativar sua própria conta." },
      { status: 400 }
    );
  }

  const usuario = await prisma.user.findUnique({ where: { id: alvoId } });
  if (!usuario) {
    return NextResponse.json({ success: false, error: "Usuário não encontrado." }, { status: 404 });
  }

  if (!usuario.ativo) {
    return NextResponse.json({ success: false, error: "Usuário já está inativo." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: alvoId },
    data:  { ativo: false },
  });

  // [admin-usuarios] Audit: desativação de usuário
  await prisma.auditLog.create({
    data: {
      userId:   adminUser.id,
      action:   "admin_desativar_usuario",
      entity:   "User",
      entityId: alvoId,
      diff:     { emailAlvo: usuario.email, ativo: { antes: true, depois: false } },
    },
  });

  return NextResponse.json({ success: true, data: { id: alvoId, ativo: false } });
}
