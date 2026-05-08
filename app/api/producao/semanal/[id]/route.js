import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  pesoPrevistoKg: z.number().min(0).optional(),
  pesoRealizadoKg: z.number().min(0).optional(),
  valorPrevisto: z.number().min(0).optional(),
  valorRealizado: z.number().min(0).optional(),
  opId: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }
  await prisma.producaoSemanal.update({ where: { id: params.id }, data: body });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  await prisma.producaoSemanal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
