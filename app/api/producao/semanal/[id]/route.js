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
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "PRODUCAO"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }
  const antes = await prisma.producaoSemanal.findUnique({ where: { id: params.id } });
  await prisma.producaoSemanal.update({ where: { id: params.id }, data: body });

  try {
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "ATUALIZAR_PRODUCAO_SEMANAL",
        entity: "ProducaoSemanal",
        entityId: params.id,
        diff: { antes, depois: body },
      },
    });
  } catch (e) {
    console.error("AuditLog error:", e);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "PRODUCAO"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  const antes = await prisma.producaoSemanal.findUnique({ where: { id: params.id } });
  await prisma.producaoSemanal.delete({ where: { id: params.id } });

  try {
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_PRODUCAO_SEMANAL",
        entity: "ProducaoSemanal",
        entityId: params.id,
        diff: { antes },
      },
    });
  } catch (e) {
    console.error("AuditLog error:", e);
  }

  return NextResponse.json({ ok: true });
}
