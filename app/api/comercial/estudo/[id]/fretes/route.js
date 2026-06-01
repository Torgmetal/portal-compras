import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const TIPOS_VEICULO = [
  "TRUCK", "CARRETA", "BITREM", "RODOTREM", "MUNCK", "PRANCHA", "OUTRO",
];

// ── GET ── Lista fretes do estudo
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const itens = await prisma.freteItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });
    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST ── Criar frete
const criarSchema = z.object({
  descricao: z.string().min(1, "Descricao obrigatoria"),
  origem: z.string().nullish(),
  destino: z.string().nullish(),
  distanciaKm: z.number().min(0).default(0),
  pesoTon: z.number().min(0).default(0),
  pesoPorCarga: z.number().min(0).nullish(),
  tipoVeiculo: z.string().nullish(),
  quantidadeViagens: z.number().int().min(1).default(1),
  custoPorViagem: z.number().min(0).default(0),
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

    // Gerar ordem sequencial se nao definida
    if (parsed.ordem == null) {
      const ultimo = await prisma.freteItem.findFirst({
        where: { estudoId: id },
        orderBy: { ordem: "desc" },
        select: { ordem: true },
      });
      parsed.ordem = (ultimo?.ordem ?? -1) + 1;
    }

    await prisma.freteItem.create({
      data: { estudoId: id, ...parsed },
    });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "CRIAR_FRETE",
        entity: "FreteItem",
        entityId: id,
        diff: { descricao: parsed.descricao },
      },
    });

    const todos = await prisma.freteItem.findMany({
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

// ── PATCH ── Atualizar frete
const updateSchema = z.object({
  itemId: z.string().min(1),
  descricao: z.string().min(1).optional(),
  origem: z.string().optional(),
  destino: z.string().optional(),
  distanciaKm: z.number().min(0).optional(),
  pesoTon: z.number().min(0).optional(),
  pesoPorCarga: z.number().min(0).nullish(),
  tipoVeiculo: z.string().optional(),
  quantidadeViagens: z.number().int().min(1).optional(),
  custoPorViagem: z.number().min(0).optional(),
  custoTotal: z.number().min(0).optional(),
  observacao: z.string().optional(),
  ordem: z.number().int().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { itemId, ...campos } = updateSchema.parse(body);

    const item = await prisma.freteItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    const atualizado = await prisma.freteItem.update({
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

// ── DELETE ── Excluir frete
export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    if (!itemId) {
      return NextResponse.json({ success: false, error: "itemId obrigatorio" }, { status: 400 });
    }

    const item = await prisma.freteItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item nao encontrado" }, { status: 404 });
    }

    await prisma.freteItem.delete({ where: { id: itemId } });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_FRETE",
        entity: "FreteItem",
        entityId: id,
        diff: { descricao: item.descricao },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
