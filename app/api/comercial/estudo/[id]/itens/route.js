import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

// ── GET /api/comercial/estudo/[id]/itens ── Lista itens de peso ──

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const itens = await prisma.pesoProjetoItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST /api/comercial/estudo/[id]/itens ── Criar item ──

const criarItemSchema = z.object({
  setor: z.string().nullish(),
  projeto: z.string().nullish(),
  tipoMaterial: z.enum([
    "PERFIL_W", "PERFIL_U", "PERFIL_L", "TUBO_REDONDO", "TUBO_QUADRADO",
    "TUBO_RETANGULAR", "CHAPA", "BARRA_REDONDA", "BARRA_CHATA",
    "BARRA_QUADRADA", "BARRA_ROSCADA", "TELA", "GRADE_PISO", "DEGRAU", "OUTRO",
  ]).nullish(),
  descricao: z.string().min(1, "Descrição é obrigatória"),
  norma: z.string().nullish(),
  comprimento: z.number().min(0).nullish(),
  pesoUnitario: z.number().min(0, "Peso unitário deve ser >= 0"),
  quantidade: z.number().int().min(1).nullish(),
  pesoTotal: z.number().min(0),
  areaPintura: z.number().min(0).nullish(),
  ordem: z.number().int().nullish(),
  // Vinculacao Omie
  codigoOmie: z.string().nullish(),
  descricaoOmie: z.string().nullish(),
  custoUnitario: z.number().min(0).nullish(),
  // Campo auxiliar do matching (nao salva no DB)
  matchScore: z.number().nullish(),
});

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();

    // Suporta criar um ou vários itens de uma vez (batch)
    const isBatch = Array.isArray(body);
    const items = isBatch ? body : [body];

    // Validar todos
    const parsed = items.map((item) => criarItemSchema.parse(item));

    // Se não tem ordem definida, gerar a próxima
    if (parsed.some((p) => p.ordem === undefined)) {
      const ultimo = await prisma.pesoProjetoItem.findFirst({
        where: { estudoId: id },
        orderBy: { ordem: "desc" },
        select: { ordem: true },
      });
      let proxOrdem = (ultimo?.ordem ?? -1) + 1;
      for (const p of parsed) {
        if (p.ordem === undefined) {
          p.ordem = proxOrdem++;
        }
      }
    }

    const criados = await prisma.pesoProjetoItem.createMany({
      data: parsed.map(({ matchScore, ...p }) => ({
        estudoId: id,
        ...p,
        tipoMaterial: p.tipoMaterial || "OUTRO",
      })),
    });

    // Recalcular totais do estudo
    const totais = await prisma.pesoProjetoItem.aggregate({
      where: { estudoId: id },
      _sum: { pesoTotal: true, areaPintura: true },
    });

    await prisma.propostaEstudo.update({
      where: { id },
      data: {
        pesoTotal: totais._sum.pesoTotal || 0,
        areaTotal: totais._sum.areaPintura || 0,
      },
    });

    // Log
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "CRIAR_ITEM_PESO",
        entity: "PesoProjetoItem",
        entityId: id,
        diff: { quantidade: criados.count },
      },
    });

    // Retornar todos os itens atualizados
    const todosItens = await prisma.pesoProjetoItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({ success: true, data: todosItens }, { status: 201 });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── PATCH /api/comercial/estudo/[id]/itens ── Atualizar item (via body.itemId) ──

const updateItemSchema = z.object({
  itemId: z.string().min(1),
  setor: z.string().nullish(),
  projeto: z.string().nullish(),
  tipoMaterial: z.enum([
    "PERFIL_W", "PERFIL_U", "PERFIL_L", "TUBO_REDONDO", "TUBO_QUADRADO",
    "TUBO_RETANGULAR", "CHAPA", "BARRA_REDONDA", "BARRA_CHATA",
    "BARRA_QUADRADA", "BARRA_ROSCADA", "TELA", "GRADE_PISO", "DEGRAU", "OUTRO",
  ]).optional(),
  descricao: z.string().min(1).optional(),
  norma: z.string().nullish(),
  comprimento: z.number().min(0).nullish(),
  pesoUnitario: z.number().min(0).optional(),
  quantidade: z.number().int().min(1).optional(),
  pesoTotal: z.number().min(0).optional(),
  areaPintura: z.number().min(0).nullish(),
  ordem: z.number().int().optional(),
  custoUnitario: z.number().min(0).nullish(),
});

export async function PATCH(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const data = updateItemSchema.parse(body);

    const { itemId, ...campos } = data;

    const item = await prisma.pesoProjetoItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item não encontrado" }, { status: 404 });
    }

    const atualizado = await prisma.pesoProjetoItem.update({
      where: { id: itemId },
      data: campos,
    });

    // Recalcular totais
    const totais = await prisma.pesoProjetoItem.aggregate({
      where: { estudoId: id },
      _sum: { pesoTotal: true, areaPintura: true },
    });

    await prisma.propostaEstudo.update({
      where: { id },
      data: {
        pesoTotal: totais._sum.pesoTotal || 0,
        areaTotal: totais._sum.areaPintura || 0,
      },
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

// ── DELETE /api/comercial/estudo/[id]/itens ── Excluir item (via body.itemId ou ?itemId=) ──

export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return NextResponse.json({ success: false, error: "itemId é obrigatório" }, { status: 400 });
    }

    const item = await prisma.pesoProjetoItem.findFirst({
      where: { id: itemId, estudoId: id },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item não encontrado" }, { status: 404 });
    }

    await prisma.pesoProjetoItem.delete({ where: { id: itemId } });

    // Recalcular totais
    const totais = await prisma.pesoProjetoItem.aggregate({
      where: { estudoId: id },
      _sum: { pesoTotal: true, areaPintura: true },
    });

    await prisma.propostaEstudo.update({
      where: { id },
      data: {
        pesoTotal: totais._sum.pesoTotal || 0,
        areaTotal: totais._sum.areaPintura || 0,
      },
    });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_ITEM_PESO",
        entity: "PesoProjetoItem",
        entityId: itemId,
        diff: { descricao: item.descricao, pesoTotal: item.pesoTotal },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
