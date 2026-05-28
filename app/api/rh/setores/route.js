import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const setorSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  sigla: z.string().optional().nullable(),
  cor: z.string().optional().nullable(),
  gestorId: z.string().optional().nullable(),
});

// GET — Lista setores
export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    const setores = await prisma.setor.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        sigla: true,
        cor: true,
        gestor: { select: { id: true, nome: true } },
        _count: { select: { funcionarios: { where: { ativo: true } } } },
      },
      orderBy: { nome: "asc" },
    });

    return NextResponse.json({ success: true, data: setores });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// PATCH — Editar setor
export async function PATCH(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const body = await req.json();
    const { id, ...dados } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "id obrigatório" }, { status: 400 });
    }

    const parsed = setorSchema.safeParse(dados);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const antes = await prisma.setor.findUnique({ where: { id }, select: { nome: true, sigla: true, cor: true, gestorId: true } });
    if (!antes) {
      return NextResponse.json({ success: false, error: "Setor não encontrado" }, { status: 404 });
    }

    const setor = await prisma.setor.update({
      where: { id },
      data: {
        nome: parsed.data.nome,
        sigla: parsed.data.sigla || null,
        cor: parsed.data.cor || null,
        gestorId: parsed.data.gestorId || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "EDITAR_SETOR",
        entity: "Setor",
        entityId: id,
        diff: { antes, depois: parsed.data },
      },
    });

    return NextResponse.json({ success: true, data: setor });
  } catch (e) {
    if (e.code === "P2002") {
      return NextResponse.json({ success: false, error: "Já existe setor com esse nome" }, { status: 409 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// DELETE — Desativar setor
export async function DELETE(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "id obrigatório" }, { status: 400 });
    }

    const setor = await prisma.setor.findUnique({
      where: { id },
      select: { nome: true, _count: { select: { funcionarios: { where: { ativo: true } } } } },
    });
    if (!setor) {
      return NextResponse.json({ success: false, error: "Setor não encontrado" }, { status: 404 });
    }

    if (setor._count.funcionarios > 0) {
      return NextResponse.json(
        { success: false, error: `Setor "${setor.nome}" possui ${setor._count.funcionarios} funcionário(s) vinculado(s). Remova-os antes de excluir.` },
        { status: 400 }
      );
    }

    await prisma.setor.update({ where: { id }, data: { ativo: false } });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "DESATIVAR_SETOR",
        entity: "Setor",
        entityId: id,
        diff: { nome: setor.nome },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// POST — Criar setor
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const body = await req.json();

    const parsed = setorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const setor = await prisma.setor.create({ data: parsed.data });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CRIAR_SETOR",
        entity: "Setor",
        entityId: setor.id,
        diff: { nome: parsed.data.nome },
      },
    });

    return NextResponse.json({ success: true, data: setor }, { status: 201 });
  } catch (e) {
    if (e.code === "P2002") {
      return NextResponse.json({ success: false, error: "Setor com esse nome já existe" }, { status: 409 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
