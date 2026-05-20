// GET /api/admin/usuarios/[id]  — detalhe do usuário
// PUT /api/admin/usuarios/[id]  — edita dados (com proteções anti-suicídio)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ROLES_VALIDAS = ["ADMIN", "COMERCIAL", "ENGENHARIA", "ALMOXARIFADO", "COMPRAS", "PRODUCAO", "FINANCEIRO", "EXPEDICAO"];

const schemaPut = z.object({
  name:             z.string().min(2).max(100).optional(),
  email:            z.string().email("E-mail inválido").toLowerCase().optional(),
  role:             z.enum(ROLES_VALIDAS, { errorMap: () => ({ message: "Role inválida" }) }).optional(),
  setor:            z.string().max(100).nullable().optional(),
  podeAlterarVerba: z.boolean().optional(),
});

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(_req, { params }) {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ success: false, error: "Apenas ADMIN." }, { status: 403 });
  }

  const usuario = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id:               true,
      name:             true,
      email:            true,
      role:             true,
      setor:            true,
      ativo:            true,
      podeAlterarVerba: true,
      createdAt:        true,
      updatedAt:        true,
    },
  });

  if (!usuario) {
    return NextResponse.json({ success: false, error: "Usuário não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: usuario });
}

// ─── PUT ─────────────────────────────────────────────────────────────────────

export async function PUT(req, { params }) {
  let adminUser;
  try {
    adminUser = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ success: false, error: "Apenas ADMIN." }, { status: 403 });
  }

  const alvoId = params.id;
  const ehProprioAdmin = adminUser.id === alvoId;

  let body;
  try {
    body = schemaPut.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.errors?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  // ── Proteções anti-suicídio ───────────────────────────────────────────────
  if (ehProprioAdmin && body.role !== undefined) {
    return NextResponse.json({ success: false, error: "Você não pode alterar sua própria role." }, { status: 400 });
  }
  if (ehProprioAdmin && body.podeAlterarVerba !== undefined) {
    return NextResponse.json({ success: false, error: "Você não pode alterar seu próprio podeAlterarVerba." }, { status: 400 });
  }

  const existente = await prisma.user.findUnique({ where: { id: alvoId } });
  if (!existente) {
    return NextResponse.json({ success: false, error: "Usuário não encontrado." }, { status: 404 });
  }

  // Verifica duplicidade de e-mail (se estiver mudando)
  if (body.email && body.email !== existente.email) {
    const emailEmUso = await prisma.user.findUnique({ where: { email: body.email } });
    if (emailEmUso) {
      return NextResponse.json({ success: false, error: "Já existe um usuário com esse e-mail." }, { status: 409 });
    }
  }

  const antes = {
    name:             existente.name,
    email:            existente.email,
    role:             existente.role,
    setor:            existente.setor,
    podeAlterarVerba: existente.podeAlterarVerba,
  };

  const atualizado = await prisma.user.update({
    where: { id: alvoId },
    data:  body,
    select: {
      id:               true,
      name:             true,
      email:            true,
      role:             true,
      setor:            true,
      ativo:            true,
      podeAlterarVerba: true,
      updatedAt:        true,
    },
  });

  // [admin-usuarios] Audit: edição de usuário
  await prisma.auditLog.create({
    data: {
      userId:   adminUser.id,
      action:   "admin_editar_usuario",
      entity:   "User",
      entityId: alvoId,
      diff:     { antes, depois: body },
    },
  });

  return NextResponse.json({ success: true, data: atualizado });
}
