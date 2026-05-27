import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const cargoSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  nivel: z.enum(["OPERACIONAL", "TECNICO", "SUPERVISAO", "GERENCIA", "DIRETORIA"]).optional().nullable(),
  categoria: z.string().optional().nullable(),
  salarioBase: z.number().optional().nullable(),
  cbo: z.string().optional().nullable(),
});

// GET — Lista cargos
export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    const cargos = await prisma.cargo.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        nivel: true,
        categoria: true,
        salarioBase: true,
        cbo: true,
        _count: { select: { funcionarios: { where: { ativo: true } } } },
      },
      orderBy: [{ nivel: "asc" }, { nome: "asc" }],
    });

    return NextResponse.json({ success: true, data: cargos });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// POST — Criar cargo
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const body = await req.json();

    const parsed = cargoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const cargo = await prisma.cargo.create({ data: parsed.data });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CRIAR_CARGO",
        entity: "Cargo",
        entityId: cargo.id,
        diff: { nome: parsed.data.nome, nivel: parsed.data.nivel },
      },
    });

    return NextResponse.json({ success: true, data: cargo }, { status: 201 });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
