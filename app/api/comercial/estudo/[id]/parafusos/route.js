import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const TIPOS = [
  "PARAFUSO", "PORCA", "ARRUELA", "CHUMBADOR",
  "BARRA_ROSCADA", "CONECTOR", "INSERTO", "OUTRO",
];

// ── GET ── Lista parafusos do estudo
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const itens = await prisma.parafusoItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });
    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST ── Criar parafusos (batch)
const criarSchema = z.object({
  tipo: z.enum(TIPOS).nullish(),
  descricao: z.string().min(1, "Descricao obrigatoria"),
  especificacao: z.string().nullish(),
  diametro: z.string().nullish(),
  comprimento: z.string().nullish(),
  unidade: z.string().default("un"),
  quantidade: z.number().min(0).default(0),
  estimativa: z.boolean().default(false),
  observacao: z.string().nullish(),
  ordem: z.number().int().nullish(),
});

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const items = Array.isArray(body) ? body : [body];
    const parsed = items.map((item) => criarSchema.parse(item));

    if (parsed.some((p) => p.ordem == null)) {
      const ultimo = await prisma.parafusoItem.findFirst({
        where: { estudoId: id },
        orderBy: { ordem: "desc" },
        select: { ordem: true },
      });
      let prox = (ultimo?.ordem ?? -1) + 1;
      for (const p of parsed) {
        if (p.ordem == null) p.ordem = prox++;
      }
    }

    await prisma.parafusoItem.createMany({
      data: parsed.map((p) => ({
        estudoId: id,
        ...p,
        tipo: p.tipo || "PARAFUSO",
      })),
    });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "CRIAR_PARAFUSO",
        entity: "ParafusoItem",
        entityId: id,
        diff: { quantidade: parsed.length },
      },
    });

    const todos = await prisma.parafusoItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
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

// ── PATCH ── Atualizar parafuso
const updateSchema = z.object({
  itemId: z.string().min(1),
  tipo: z.enum(TIPOS).optional(),
  descricao: z.string().min(1).optional(),
  especificacao: z.string().optional(),
  diametro: z.string().optional(),
  comprimento: z.string().optional(),
  unidade: z.string().optional(),
  quantidade: z.number().min(0).optional(),
  estimativa: z.boolean().optional(),
  observacao: z.string().optional(),
  ordem: z.number().int().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { itemId, ...campos } = updateSchema.parse(body);

    const item = await prisma.parafusoItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    const atualizado = await prisma.parafusoItem.update({
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

// ── DELETE ── Excluir parafuso
export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    if (!itemId) {
      return NextResponse.json({ success: false, error: "itemId obrigatorio" }, { status: 400 });
    }

    const item = await prisma.parafusoItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    await prisma.parafusoItem.delete({ where: { id: itemId } });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_PARAFUSO",
        entity: "ParafusoItem",
        entityId: itemId,
        diff: { descricao: item.descricao },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
