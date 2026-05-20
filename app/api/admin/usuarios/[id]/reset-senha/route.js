// POST /api/admin/usuarios/[id]/reset-senha
// Gera nova senha temporária para o usuário alvo e retorna em plaintext.
// Admin pode resetar a própria senha (não é anti-suicídio — é permitido).
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarSenhaTemporaria } from "@/lib/gerar-senha";

export async function POST(_req, { params }) {
  let adminUser;
  try {
    adminUser = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ success: false, error: "Apenas ADMIN." }, { status: 403 });
  }

  const alvoId = params.id;

  const usuario = await prisma.user.findUnique({ where: { id: alvoId } });
  if (!usuario) {
    return NextResponse.json({ success: false, error: "Usuário não encontrado." }, { status: 404 });
  }

  const senhaTemporaria = gerarSenhaTemporaria();
  const hash = await bcrypt.hash(senhaTemporaria, 10);

  await prisma.user.update({
    where: { id: alvoId },
    data:  { password: hash },
  });

  // [admin-usuarios] Audit: reset de senha
  await prisma.auditLog.create({
    data: {
      userId:   adminUser.id,
      action:   "admin_reset_senha",
      entity:   "User",
      entityId: alvoId,
      diff:     { emailAlvo: usuario.email },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      senhaTemporaria, // retornada em plaintext UMA VEZ
      emailAlvo: usuario.email,
    },
  });
}
