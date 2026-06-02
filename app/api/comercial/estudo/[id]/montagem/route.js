import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const SECOES_VALIDAS = ["EQUIPE", "ALOJAMENTO", "CONTAINER", "EQUIPAMENTO", "OUTROS"];

// ── GET ── Lista itens de montagem do estudo
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const itens = await prisma.montagemItem.findMany({
      where: { estudoId: id },
      orderBy: [{ secao: "asc" }, { ordem: "asc" }],
    });
    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST ── Criar item de montagem
const criarSchema = z.object({
  secao: z.enum(SECOES_VALIDAS),
  descricao: z.string().min(1, "Descricao obrigatoria"),
  quantidade: z.number().int().min(1).default(1),
  dias: z.number().min(0).default(0),
  custoDiario: z.number().min(0).default(0),
  custoFixo: z.number().min(0).default(0),
  custoTotal: z.number().min(0).default(0),
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
      const ultimo = await prisma.montagemItem.findFirst({
        where: { estudoId: id, secao: parsed.secao },
        orderBy: { ordem: "desc" },
        select: { ordem: true },
      });
      parsed.ordem = (ultimo?.ordem ?? -1) + 1;
    }

    await prisma.montagemItem.create({
      data: { estudoId: id, ...parsed },
    });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "CRIAR_MONTAGEM_ITEM",
        entity: "MontagemItem",
        entityId: id,
        diff: { secao: parsed.secao, descricao: parsed.descricao },
      },
    });

    const todos = await prisma.montagemItem.findMany({
      where: { estudoId: id },
      orderBy: [{ secao: "asc" }, { ordem: "asc" }],
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
  quantidade: z.number().int().min(1).optional(),
  dias: z.number().min(0).optional(),
  custoDiario: z.number().min(0).optional(),
  custoFixo: z.number().min(0).optional(),
  custoTotal: z.number().min(0).optional(),
  observacao: z.string().nullish(),
  ordem: z.number().int().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { itemId, ...campos } = updateSchema.parse(body);

    const item = await prisma.montagemItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    const atualizado = await prisma.montagemItem.update({
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

    const item = await prisma.montagemItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    await prisma.montagemItem.delete({ where: { id: itemId } });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_MONTAGEM_ITEM",
        entity: "MontagemItem",
        entityId: id,
        diff: { secao: item.secao, descricao: item.descricao },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
