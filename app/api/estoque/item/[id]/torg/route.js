// PATCH /api/estoque/item/:id/torg — toggle do flag estoqueTorg num item.
// Apenas ADMIN. Audit log registra a mudanca.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  estoqueTorg: z.boolean(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas ADMIN." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  const item = await prisma.estoqueItem.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "Item nao encontrado." }, { status: 404 });

  const atualizado = await prisma.estoqueItem.update({
    where: { id: item.id },
    data: { estoqueTorg: body.estoqueTorg },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "toggle_estoque_torg",
      entity: "EstoqueItem",
      entityId: item.id,
      diff: {
        codigoOmie: item.codigoOmie,
        descricao: item.descricao,
        antes: item.estoqueTorg,
        depois: body.estoqueTorg,
      },
    },
  });

  return NextResponse.json({ item: atualizado });
}
