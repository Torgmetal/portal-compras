import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const TIPOS_PINTURA = [
  "PRIMER", "ESMALTE", "EPOXI", "POLIURETANO",
  "GALVANIZACAO_FRIO", "INTUMESCENTE", "ZARCAO", "ALQUIDICA", "OUTRO",
];

// ── GET ── Lista itens de pintura do estudo
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const itens = await prisma.pinturaItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });
    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST ── Criar itens de pintura (batch)
const criarSchema = z.object({
  tipoPintura: z.enum(TIPOS_PINTURA).nullish(),
  descricao: z.string().min(1, "Descricao obrigatoria"),
  especificacao: z.string().nullish(),
  areaM2: z.number().min(0).default(0),
  demaos: z.number().int().min(1).max(5).default(1),
  espessuraMicra: z.number().min(0).nullish(),
  unidade: z.string().default("m2"),
  quantidade: z.number().min(0).default(0),
  cor: z.string().nullish(),
  norma: z.string().nullish(),
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
      const ultimo = await prisma.pinturaItem.findFirst({
        where: { estudoId: id },
        orderBy: { ordem: "desc" },
        select: { ordem: true },
      });
      let prox = (ultimo?.ordem ?? -1) + 1;
      for (const p of parsed) {
        if (p.ordem == null) p.ordem = prox++;
      }
    }

    await prisma.pinturaItem.createMany({
      data: parsed.map((p) => ({
        estudoId: id,
        ...p,
        tipoPintura: p.tipoPintura || "OUTRO",
      })),
    });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "CRIAR_PINTURA",
        entity: "PinturaItem",
        entityId: id,
        diff: { quantidade: parsed.length },
      },
    });

    const todos = await prisma.pinturaItem.findMany({
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

// ── PATCH ── Atualizar item de pintura
const updateSchema = z.object({
  itemId: z.string().min(1),
  tipoPintura: z.enum(TIPOS_PINTURA).optional(),
  descricao: z.string().min(1).optional(),
  especificacao: z.string().optional(),
  areaM2: z.number().min(0).optional(),
  demaos: z.number().int().min(1).max(5).optional(),
  espessuraMicra: z.number().min(0).optional(),
  unidade: z.string().optional(),
  quantidade: z.number().min(0).optional(),
  cor: z.string().optional(),
  norma: z.string().optional(),
  observacao: z.string().optional(),
  ordem: z.number().int().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { itemId, ...campos } = updateSchema.parse(body);

    const item = await prisma.pinturaItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    const atualizado = await prisma.pinturaItem.update({
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

// ── DELETE ── Excluir item de pintura
export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    if (!itemId) {
      return NextResponse.json({ success: false, error: "itemId obrigatorio" }, { status: 400 });
    }

    const item = await prisma.pinturaItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    await prisma.pinturaItem.delete({ where: { id: itemId } });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_PINTURA",
        entity: "PinturaItem",
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
