import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({ motivo: z.string().min(1) });

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode cancelar itens." }, { status: 403 });
  }

  const body = schema.parse(await req.json());

  const item = await prisma.rMItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.rmId !== params.id) {
    return NextResponse.json({ error: "Item não encontrado nessa RM." }, { status: 404 });
  }
  if (item.status !== "PENDENTE") {
    return NextResponse.json({ error: `Item em status "${item.status}" não pode ser cancelado.` }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.rMItem.update({
      where: { id: params.itemId },
      data: {
        status: "CANCELADO",
        canceladoMotivo: body.motivo,
        canceladoEm: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "cancelar_rmitem",
        entity: "RMItem",
        entityId: params.itemId,
        diff: { motivo: body.motivo, descricao: item.descricao },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
