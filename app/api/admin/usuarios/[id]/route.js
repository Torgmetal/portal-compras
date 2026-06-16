// GET /api/admin/usuarios/[id]  — detalhe do usuário
// PUT /api/admin/usuarios/[id]  — edita dados (com proteções anti-suicídio)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const TIPOS_VALIDOS   = ["ADMIN", "USUARIO"];
const MODULOS_VALIDOS = ["COMERCIAL", "ENGENHARIA", "COMPRAS", "PRODUCAO", "ALMOXARIFADO", "FINANCEIRO", "EXPEDICAO", "RH", "PLANEJAMENTO", "PCP", "REQUISICOES", "QUALIDADE"];

const schemaPut = z.object({
  name:             z.string().min(2).max(100).optional(),
  email:            z.string().email("E-mail inválido").toLowerCase().optional(),
  tipo:             z.enum(TIPOS_VALIDOS).optional(),
  modulos:          z.array(z.enum(MODULOS_VALIDOS)).optional(),
  setor:            z.string().max(100).nullable().optional(),
  podeAlterarVerba: z.boolean().optional(),
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

export async function GET(_req, { params }) {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const usuario = await prisma.user.findUnique({
    where: { id: params.id },
    select: selectUsuario,
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
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const alvoId = params.id;
  const ehProprioAdmin = adminUser.id === alvoId;

  let body;
  try {
    body = schemaPut.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  // ── Proteções anti-suicídio ───────────────────────────────────────────────
  if (ehProprioAdmin && body.tipo !== undefined) {
    return NextResponse.json({ success: false, error: "Você não pode alterar seu próprio tipo." }, { status: 400 });
  }
  if (ehProprioAdmin && body.podeAlterarVerba !== undefined) {
    return NextResponse.json({ success: false, error: "Você não pode alterar seu próprio podeAlterarVerba." }, { status: 400 });
  }

  const existente = await prisma.user.findUnique({
    where: { id: alvoId },
    include: { modulos: { select: { modulo: true } } },
  });
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

  // Valida: USUARIO deve ter módulos
  const novoTipo = body.tipo ?? existente.tipo;
  if (novoTipo === "USUARIO") {
    const novosModulos = body.modulos ?? existente.modulos.map((m) => m.modulo);
    if (!novosModulos || novosModulos.length === 0) {
      return NextResponse.json({ success: false, error: "Usuário do tipo USUARIO deve ter pelo menos um módulo." }, { status: 400 });
    }
  }

  const antes = {
    name:             existente.name,
    email:            existente.email,
    tipo:             existente.tipo,
    modulos:          existente.modulos.map((m) => m.modulo),
    setor:            existente.setor,
    podeAlterarVerba: existente.podeAlterarVerba,
  };

  // Campos escalares do User (sem modulos — tratados separado)
  const { modulos: novoModulosBody, ...camposEscalares } = body;

  // Atualiza em transação: campos escalares + deleção/recriação de UserModulo
  const atualizado = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: alvoId },
      data: camposEscalares,
    });

    // Recria módulos se tipo ou modulos foram enviados
    const atualizarModulos = body.tipo !== undefined || novoModulosBody !== undefined;
    if (atualizarModulos) {
      await tx.userModulo.deleteMany({ where: { userId: alvoId } });
      if (novoTipo !== "ADMIN") {
        const modsFinal = novoModulosBody ?? existente.modulos.map((m) => m.modulo);
        if (modsFinal.length > 0) {
          await tx.userModulo.createMany({
            data: modsFinal.map((m) => ({ userId: alvoId, modulo: m })),
          });
        }
      }
    }

    return tx.user.findUnique({ where: { id: alvoId }, select: selectUsuario });
  });

  // [admin-usuarios] Audit: edição de usuário
  await prisma.auditLog.create({
    data: {
      userId:   adminUser.id,
      action:   "admin_editar_usuario",
      entity:   "User",
      entityId: alvoId,
      diff:     {
        antes,
        depois: {
          ...camposEscalares,
          ...(novoModulosBody !== undefined && { modulos: novoModulosBody }),
        },
      },
    },
  });

  return NextResponse.json({ success: true, data: atualizado });
}
