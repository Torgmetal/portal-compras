// GET  /api/admin/usuarios  — lista usuários (default: só ativos; ?ativo=false → inativos; ?ativo=todos → todos)
// POST /api/admin/usuarios  — cria novo usuário e retorna senha temporária
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarSenhaTemporaria } from "@/lib/gerar-senha";

const TIPOS_VALIDOS   = ["ADMIN", "USUARIO"];
const MODULOS_VALIDOS = ["COMERCIAL", "ENGENHARIA", "COMPRAS", "PRODUCAO", "ALMOXARIFADO", "FINANCEIRO", "EXPEDICAO"];

const schemaPost = z.object({
  name:             z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  email:            z.string().email("E-mail inválido").toLowerCase(),
  tipo:             z.enum(TIPOS_VALIDOS),
  modulos:          z.array(z.enum(MODULOS_VALIDOS)).optional().default([]),
  setor:            z.string().max(100).optional().nullable(),
  podeAlterarVerba: z.boolean().default(false),
});

/** Selects reutilizáveis */
const selectUsuario = {
  id:               true,
  name:             true,
  email:            true,
  tipo:             true,
  modulos:          { select: { modulo: true } },
  setor:            true,
  ativo:            true,
  podeAlterarVerba: true,
  createdAt:        true,
  updatedAt:        true,
};

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req) {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const tipoFilter  = searchParams.get("tipo");   // "ADMIN" | "USUARIO"
  const moduloFilter = searchParams.get("modulo"); // ex: "COMPRAS"
  const ativoParam  = searchParams.get("ativo");
  // ?ativo não enviado ou "true" → só ativos (default)
  // ?ativo=false                 → só inativos
  // ?ativo=todos                 → sem filtro

  const where = {};
  if (tipoFilter && TIPOS_VALIDOS.includes(tipoFilter)) where.tipo = tipoFilter;
  if (moduloFilter && MODULOS_VALIDOS.includes(moduloFilter)) {
    where.modulos = { some: { modulo: moduloFilter } };
  }
  if (ativoParam === "false")       where.ativo = false;
  else if (ativoParam !== "todos")  where.ativo = true; // default: apenas ativos

  const usuarios = await prisma.user.findMany({
    where,
    select: selectUsuario,
    orderBy: [{ ativo: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ success: true, data: usuarios });
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req) {
  let adminUser;
  try {
    adminUser = await requireRole(["ADMIN"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schemaPost.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  // USUARIO deve ter ao menos 1 módulo
  if (body.tipo === "USUARIO" && (!body.modulos || body.modulos.length === 0)) {
    return NextResponse.json({ success: false, error: "Usuário do tipo USUARIO deve ter pelo menos um módulo." }, { status: 400 });
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
      tipo:             body.tipo,
      setor:            body.setor ?? null,
      podeAlterarVerba: body.podeAlterarVerba,
      ativo:            true,
      ...(body.tipo === "USUARIO" && body.modulos?.length > 0 && {
        modulos: { create: body.modulos.map((m) => ({ modulo: m })) },
      }),
    },
    select: selectUsuario,
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
        tipo:             novoUsuario.tipo,
        modulos:          novoUsuario.modulos.map((m) => m.modulo),
        setor:            novoUsuario.setor,
        podeAlterarVerba: novoUsuario.podeAlterarVerba,
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      usuario:        novoUsuario,
      senhaTemporaria, // retornada em plaintext UMA VEZ — tela deve exibir e descartar
    },
  }, { status: 201 });
}
