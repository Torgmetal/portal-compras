// GET  /api/admin/usuarios  — lista todos os usuários (com filtros opcionais)
// POST /api/admin/usuarios  — cria novo usuário e retorna senha temporária
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarSenhaTemporaria } from "@/lib/gerar-senha";

const ROLES_VALIDAS = ["ADMIN", "COMERCIAL", "ENGENHARIA", "ALMOXARIFADO", "COMPRAS", "PRODUCAO", "FINANCEIRO", "EXPEDICAO"];

const schemaPost = z.object({
  name:             z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  email:            z.string().email("E-mail inválido").toLowerCase(),
  role:             z.enum(ROLES_VALIDAS, { errorMap: () => ({ message: "Role inválida" }) }),
  setor:            z.string().max(100).optional().nullable(),
  podeAlterarVerba: z.boolean().default(false),
});

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req) {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ success: false, error: "Apenas ADMIN." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const roleFilter  = searchParams.get("role");
  const ativoParam  = searchParams.get("ativo"); // "true" | "false" | null (todos)

  const where = {};
  if (roleFilter && ROLES_VALIDAS.includes(roleFilter)) where.role = roleFilter;
  if (ativoParam === "true")  where.ativo = true;
  if (ativoParam === "false") where.ativo = false;

  const usuarios = await prisma.user.findMany({
    where,
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
    orderBy: [{ ativo: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ success: true, data: usuarios });
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req) {
  let adminUser;
  try {
    adminUser = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ success: false, error: "Apenas ADMIN." }, { status: 403 });
  }

  let body;
  try {
    body = schemaPost.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.errors?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  // Verifica duplicidade de e-mail
  const existente = await prisma.user.findUnique({ where: { email: body.email } });
  if (existente) {
    return NextResponse.json({ success: false, error: "Já existe um usuário com esse e-mail." }, { status: 409 });
  }

  const senhaTemporaria = gerarSenhaTemporaria();
  const hash = await bcrypt.hash(senhaTemporaria, 10);

  const novoUsuario = await prisma.user.create({
    data: {
      name:             body.name,
      email:            body.email,
      password:         hash,
      role:             body.role,
      setor:            body.setor ?? null,
      podeAlterarVerba: body.podeAlterarVerba,
      ativo:            true,
    },
    select: {
      id:               true,
      name:             true,
      email:            true,
      role:             true,
      setor:            true,
      ativo:            true,
      podeAlterarVerba: true,
      createdAt:        true,
    },
  });

  // [admin-usuarios] Audit: criação de usuário
  await prisma.auditLog.create({
    data: {
      userId:   adminUser.id,
      action:   "admin_criar_usuario",
      entity:   "User",
      entityId: novoUsuario.id,
      diff: {
        email:            novoUsuario.email,
        role:             novoUsuario.role,
        setor:            novoUsuario.setor,
        podeAlterarVerba: novoUsuario.podeAlterarVerba,
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      usuario:          novoUsuario,
      senhaTemporaria,  // retornada em plaintext UMA VEZ — tela deve exibir e descartar
    },
  }, { status: 201 });
}
