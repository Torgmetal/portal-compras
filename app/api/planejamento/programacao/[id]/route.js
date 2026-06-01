import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const schemaUpdate = z.object({
  descricao: z.string().nullable().optional(),
  pesoKg: z.number().min(0).optional(),
  prioridade: z.enum(["ALTA", "MEDIA", "BAIXA"]).optional(),
  status: z.enum(["PENDENTE", "EM_ANDAMENTO", "CONCLUIDO"]).optional(),
  observacao: z.string().nullable().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }

  let body;
  try {
    body = schemaUpdate.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const item = await prisma.necessidadeSemanal.update({
    where: { id: params.id },
    data: body,
  });

  return NextResponse.json({ item });
}

export async function DELETE(req, { params }) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }

  await prisma.necessidadeSemanal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
