import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const vagaSchema = z.object({
  titulo: z.string().min(2, "Título obrigatório (mín. 2 caracteres)"),
  setorId: z.string().min(1, "Setor obrigatório"),
  cargoId: z.string().optional().nullable(),
  quantidade: z.number().int().min(1, "Quantidade mínima é 1").default(1),
  prioridade: z.enum(["URGENTE", "ALTA", "NORMAL", "BAIXA"]).optional().nullable(),
  tipo: z.enum(["CLT", "PJ", "ESTAGIO", "TEMPORARIO"]).optional().nullable(),
  nivelCargo: z.enum(["OPERACIONAL", "TECNICO", "SUPERVISAO", "GERENCIA"]).optional().nullable(),
  justificativa: z.string().optional().nullable(),
  requisitos: z.string().optional().nullable(),
  salarioFaixa: z.string().optional().nullable(),
});

// GET — Listar vagas
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const setorId = searchParams.get("setorId");
    const todos = searchParams.get("todos") === "true";

    const where = {};

    if (status) {
      where.status = status;
    } else if (!todos) {
      where.status = { notIn: ["PREENCHIDA", "CANCELADA"] };
    }

    if (setorId) {
      where.setorId = setorId;
    }

    const vagas = await prisma.vaga.findMany({
      where,
      include: {
        setor: { select: { id: true, nome: true } },
        cargo: { select: { id: true, nome: true } },
      },
      orderBy: { dataAbertura: "desc" },
    });

    return NextResponse.json({ success: true, data: vagas });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// POST — Criar vaga
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const body = await req.json();

    const parsed = vagaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const vaga = await prisma.vaga.create({
      data: {
        titulo: data.titulo,
        setorId: data.setorId,
        cargoId: data.cargoId || null,
        quantidade: data.quantidade,
        prioridade: data.prioridade || null,
        tipo: data.tipo || null,
        nivelCargo: data.nivelCargo || null,
        justificativa: data.justificativa || null,
        requisitos: data.requisitos || null,
        salarioFaixa: data.salarioFaixa || null,
        status: "SOLICITADA",
      },
      include: {
        setor: { select: { id: true, nome: true } },
        cargo: { select: { id: true, nome: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CRIAR_VAGA",
        entity: "Vaga",
        entityId: vaga.id,
        diff: { titulo: data.titulo, setor: data.setorId, quantidade: data.quantidade },
      },
    });

    return NextResponse.json({ success: true, data: vaga }, { status: 201 });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json(
        { success: false, error: e.issues[0]?.message },
        { status: 400 }
      );
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
