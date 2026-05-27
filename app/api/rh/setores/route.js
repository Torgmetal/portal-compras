import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const setorSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  sigla: z.string().optional().nullable(),
  cor: z.string().optional().nullable(),
  gestorId: z.string().optional().nullable(),
});

// GET — Lista setores
export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    const setores = await prisma.setor.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        sigla: true,
        cor: true,
        gestor: { select: { id: true, nome: true } },
        _count: { select: { funcionarios: { where: { ativo: true } } } },
      },
      orderBy: { nome: "asc" },
    });

    return NextResponse.json({ success: true, data: setores });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// POST — Criar setor
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const body = await req.json();

    const parsed = setorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const setor = await prisma.setor.create({ data: parsed.data });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CRIAR_SETOR",
        entity: "Setor",
        entityId: setor.id,
        diff: { nome: parsed.data.nome },
      },
    });

    return NextResponse.json({ success: true, data: setor }, { status: 201 });
  } catch (e) {
    if (e.code === "P2002") {
      return NextResponse.json({ success: false, error: "Setor com esse nome já existe" }, { status: 409 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
