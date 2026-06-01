import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

// ── GET — listar eventos de faturamento ──
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const itens = await prisma.faturamentoEvento.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST — criar evento(s) ──
const criarSchema = z.union([
  z.object({
    descricao: z.string().min(1),
    tipoNota: z.enum(["NFE", "NFSE"]),
    cfop: z.string().nullable().optional(),
    codigoServico: z.string().nullable().optional(),
    percentual: z.number().min(0).max(100),
  }),
  z.array(z.object({
    descricao: z.string().min(1),
    tipoNota: z.enum(["NFE", "NFSE"]),
    cfop: z.string().nullable().optional(),
    codigoServico: z.string().nullable().optional(),
    percentual: z.number().min(0).max(100),
  })),
]);

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const data = criarSchema.parse(body);

    // Pegar a maior ordem existente
    const ultimo = await prisma.faturamentoEvento.findFirst({
      where: { estudoId: id },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });
    let proximaOrdem = (ultimo?.ordem ?? -1) + 1;

    const itensParaCriar = Array.isArray(data) ? data : [data];
    const idsCriados = [];

    for (const item of itensParaCriar) {
      const criado = await prisma.faturamentoEvento.create({
        data: {
          estudoId: id,
          descricao: item.descricao,
          tipoNota: item.tipoNota,
          cfop: item.cfop || null,
          codigoServico: item.codigoServico || null,
          percentual: item.percentual,
          ordem: proximaOrdem++,
        },
      });
      idsCriados.push(criado.id);
    }

    const itens = await prisma.faturamentoEvento.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    try {
      await prisma.auditLog.create({
        data: {
          user: { connect: { id: user.id } },
          action: "CRIAR_FATURAMENTO",
          entity: "FaturamentoEvento",
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

// ── PATCH — atualizar evento ──
const atualizarSchema = z.object({
  itemId: z.string(),
  descricao: z.string().min(1).optional(),
  tipoNota: z.enum(["NFE", "NFSE"]).optional(),
  cfop: z.string().nullable().optional(),
  codigoServico: z.string().nullable().optional(),
  percentual: z.number().min(0).max(100).optional(),
  ordem: z.number().int().min(0).optional(),
});

export async function PATCH(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const { itemId, ...data } = atualizarSchema.parse(body);

    const antes = await prisma.faturamentoEvento.findUnique({ where: { id: itemId } });

    await prisma.faturamentoEvento.update({
      where: { id: itemId, estudoId: id },
      data,
    });

    const itens = await prisma.faturamentoEvento.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    try {
      await prisma.auditLog.create({
        data: {
          user: { connect: { id: user.id } },
          action: "ATUALIZAR_FATURAMENTO",
          entity: "FaturamentoEvento",
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

// ── DELETE — excluir evento ──
export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return NextResponse.json({ success: false, error: "itemId obrigatorio" }, { status: 400 });
    }

    const antes = await prisma.faturamentoEvento.findUnique({ where: { id: itemId } });

    await prisma.faturamentoEvento.delete({
      where: { id: itemId, estudoId: id },
    });

    try {
      await prisma.auditLog.create({
        data: {
          user: { connect: { id: user.id } },
          action: "EXCLUIR_FATURAMENTO",
          entity: "FaturamentoEvento",
          entityId: itemId,
          diff: { antes },
        },
      });
    } catch (e) {
      console.error("AuditLog error:", e);
    }

    const itens = await prisma.faturamentoEvento.findMany({
      where: { estudoId: id },
      orderBy: { ordem: "asc" },
    });

    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
