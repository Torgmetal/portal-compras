import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

// ── GET — listar itens do cronograma ──
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const itens = await prisma.cronogramaItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST — criar item(ns) do cronograma ──
const criarSchema = z.union([
  z.object({
    grupo: z.string().min(1),
    descricao: z.string().nullable().optional(),
    pesoKg: z.number().min(0).optional(),
    diasFabricacao: z.number().int().min(0).optional(),
    diasMontagem: z.number().int().min(0).nullable().optional(),
    semanaInicio: z.number().int().min(1).optional(),
    cor: z.string().nullable().optional(),
    observacao: z.string().nullable().optional(),
  }),
  z.array(z.object({
    grupo: z.string().min(1),
    descricao: z.string().nullable().optional(),
    pesoKg: z.number().min(0).optional(),
    diasFabricacao: z.number().int().min(0).optional(),
    diasMontagem: z.number().int().min(0).nullable().optional(),
    semanaInicio: z.number().int().min(1).optional(),
    cor: z.string().nullable().optional(),
    observacao: z.string().nullable().optional(),
  })),
]);

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const data = criarSchema.parse(body);

    // Pegar a maior ordem existente
    const ultimo = await prisma.cronogramaItem.findFirst({
      where: { estudoId: id },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });
    let proximaOrdem = (ultimo?.ordem ?? -1) + 1;

    const itensParaCriar = Array.isArray(data) ? data : [data];
    const idsCriados = [];

    for (const item of itensParaCriar) {
      const criado = await prisma.cronogramaItem.create({
        data: {
          estudoId: id,
          grupo: item.grupo,
          descricao: item.descricao || null,
          pesoKg: item.pesoKg || 0,
          diasFabricacao: item.diasFabricacao || 0,
          diasMontagem: item.diasMontagem ?? null,
          semanaInicio: item.semanaInicio || proximaOrdem + 1,
          cor: item.cor || null,
          observacao: item.observacao || null,
          ordem: proximaOrdem++,
        },
      });
      idsCriados.push(criado.id);
    }

    const itens = await prisma.cronogramaItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    try {
      await prisma.auditLog.create({
        data: {
          user: { connect: { id: user.id } },
          action: "CRIAR_CRONOGRAMA",
          entity: "CronogramaItem",
          entityId: id,
          diff: { depois: { estudoId: id, idsCriados, itens: itensParaCriar } },
        },
      });
    } catch (e) {
      console.error("AuditLog error:", e);
    }

    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── PATCH — atualizar item ──
const atualizarSchema = z.object({
  itemId: z.string(),
  grupo: z.string().min(1).optional(),
  descricao: z.string().nullable().optional(),
  pesoKg: z.number().min(0).optional(),
  diasFabricacao: z.number().int().min(0).optional(),
  diasMontagem: z.number().int().min(0).nullable().optional(),
  semanaInicio: z.number().int().min(1).optional(),
  cor: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  ordem: z.number().int().min(0).optional(),
});

export async function PATCH(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { itemId, ...data } = atualizarSchema.parse(body);

    const antes = await prisma.cronogramaItem.findUnique({ where: { id: itemId } });

    await prisma.cronogramaItem.update({
      where: { id: itemId, estudoId: id },
      data,
    });

    const itens = await prisma.cronogramaItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    try {
      await prisma.auditLog.create({
        data: {
          user: { connect: { id: user.id } },
          action: "ATUALIZAR_CRONOGRAMA",
          entity: "CronogramaItem",
          entityId: itemId,
          diff: { antes, depois: data },
        },
      });
    } catch (e) {
      console.error("AuditLog error:", e);
    }

    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── DELETE — excluir item ou todos ──
export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    const todos = searchParams.get("todos");

    let antes = null;
    if (todos === "true") {
      antes = await prisma.cronogramaItem.findMany({ where: { estudoId: id } });
      await prisma.cronogramaItem.deleteMany({ where: { estudoId: id } });
    } else if (itemId) {
      antes = await prisma.cronogramaItem.findUnique({ where: { id: itemId } });
      await prisma.cronogramaItem.delete({
        where: { id: itemId, estudoId: id },
      });
    } else {
      return NextResponse.json({ success: false, error: "itemId ou todos=true obrigatorio" }, { status: 400 });
    }

    try {
      await prisma.auditLog.create({
        data: {
          user: { connect: { id: user.id } },
          action: "EXCLUIR_CRONOGRAMA",
          entity: "CronogramaItem",
          entityId: todos === "true" ? id : itemId,
          diff: { antes, excluirTodos: todos === "true" },
        },
      });
    } catch (e) {
      console.error("AuditLog error:", e);
    }

    const itens = await prisma.cronogramaItem.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
