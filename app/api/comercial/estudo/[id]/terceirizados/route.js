import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

// ── GET ── Lista itens terceirizados do estudo
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const itens = await prisma.terceirizadoItem.findMany({
      where: { estudoId: id },
      orderBy: [{ servico: "asc" }, { ordem: "asc" }],
    });
    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST ── Criar item
const criarSchema = z.object({
  servico: z.string().min(1, "Tipo de servico obrigatorio"),
  descricao: z.string().min(1, "Descricao obrigatoria"),
  unidade: z.string().default("VB"),
  quantidade: z.number().min(0).default(1),
  pesoKg: z.number().min(0).default(0),
  custoUnitario: z.number().min(0).default(0),
  custoTotal: z.number().min(0).default(0),
  fornecedor: z.string().nullish(),
  observacao: z.string().nullish(),
  ordem: z.number().int().nullish(),
});

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const parsed = criarSchema.parse(body);

    if (parsed.ordem == null) {
      const ultimo = await prisma.terceirizadoItem.findFirst({
        where: { estudoId: id, servico: parsed.servico },
        orderBy: { ordem: "desc" },
        select: { ordem: true },
      });
      parsed.ordem = (ultimo?.ordem ?? -1) + 1;
    }

    await prisma.terceirizadoItem.create({
      data: { estudoId: id, ...parsed },
    });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "CRIAR_TERCEIRIZADO_ITEM",
        entity: "TerceirizadoItem",
        entityId: id,
        diff: { servico: parsed.servico, descricao: parsed.descricao },
      },
    });

    const todos = await prisma.terceirizadoItem.findMany({
      where: { estudoId: id },
      orderBy: [{ servico: "asc" }, { ordem: "asc" }],
    });
    return NextResponse.json({ success: true, data: todos }, { status: 201 });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── PATCH ── Atualizar item
const updateSchema = z.object({
  itemId: z.string().min(1),
  descricao: z.string().min(1).optional(),
  unidade: z.string().optional(),
  quantidade: z.number().min(0).optional(),
  pesoKg: z.number().min(0).optional(),
  custoUnitario: z.number().min(0).optional(),
  custoTotal: z.number().min(0).optional(),
  fornecedor: z.string().nullish(),
  observacao: z.string().nullish(),
  ordem: z.number().int().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { itemId, ...campos } = updateSchema.parse(body);

    const item = await prisma.terceirizadoItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    const atualizado = await prisma.terceirizadoItem.update({
      where: { id: itemId },
      data: campos,
    });
    return NextResponse.json({ success: true, data: atualizado });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── DELETE ── Excluir item
export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    if (!itemId) {
      return NextResponse.json({ success: false, error: "itemId obrigatorio" }, { status: 400 });
    }

    const item = await prisma.terceirizadoItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    await prisma.terceirizadoItem.delete({ where: { id: itemId } });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_TERCEIRIZADO_ITEM",
        entity: "TerceirizadoItem",
        entityId: id,
        diff: { servico: item.servico, descricao: item.descricao },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
