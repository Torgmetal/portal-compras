import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  categoriaCompra: z.string().optional(),
  localEstoque: z.string().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
  }

  const data = {};
  if (body.categoriaCompra !== undefined) data.categoriaCompra = body.categoriaCompra || null;
  if (body.localEstoque !== undefined) data.localEstoque = body.localEstoque || null;

  await prisma.rM.update({ where: { id: params.id }, data });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "config_omie_rm",
      entity: "RM",
      entityId: params.id,
      diff: data,
    },
  });

  return NextResponse.json({ ok: true });
}
