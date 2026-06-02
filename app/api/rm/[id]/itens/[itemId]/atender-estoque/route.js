import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  quantidade: z.number().positive("Quantidade deve ser maior que zero"),
  observacao: z.string().max(500).optional(),
  precoUnitario: z.number().min(0).optional().nullable(),
});

/**
 * POST /api/rm/[id]/itens/[itemId]/atender-estoque
 * Marca um item como atendido pelo estoque interno, sem gerar pedido Omie.
 * Registra a quantidade vinculada para controle da OP.
 */
export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const { id: rmId, itemId } = await params;

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e.issues?.[0]?.message || "Dados invalidos" },
      { status: 400 }
    );
  }

  const item = await prisma.rMItem.findUnique({
    where: { id: itemId },
    include: { rm: { select: { id: true, numero: true } } },
  });
  if (!item || item.rmId !== rmId) {
    return NextResponse.json({ error: "Item nao encontrado nessa RM." }, { status: 404 });
  }

  // Permite atender itens que ainda nao viraram pedido
  if (item.status === "PEDIDO_GERADO" || item.status === "CANCELADO" || item.status === "ATENDIDO_ESTOQUE") {
    return NextResponse.json(
      { error: `Item em status "${item.status}" nao pode ser atendido com estoque.` },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.rMItem.update({
      where: { id: itemId },
      data: {
        status: "ATENDIDO_ESTOQUE",
        atendidoEstoqueEm: new Date(),
        atendidoEstoqueQtd: body.quantidade,
        atendidoEstoqueObs: body.observacao || null,
        atendidoEstoquePreco: body.precoUnitario ?? null,
        atendidoEstoqueTotal: body.precoUnitario ? body.precoUnitario * body.quantidade : null,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "atender_estoque_rmitem",
        entity: "RMItem",
        entityId: itemId,
        diff: {
          antes: { status: item.status },
          depois: {
            status: "ATENDIDO_ESTOQUE",
            quantidade: body.quantidade,
            precoUnitario: body.precoUnitario ?? null,
            total: body.precoUnitario ? body.precoUnitario * body.quantidade : null,
            observacao: body.observacao || null,
          },
          rmNumero: item.rm.numero,
          descricao: item.descricao,
        },
      },
    }),
  ]);

  // Verifica se todos os itens da RM estao finalizados
  const rmItens = await prisma.rMItem.findMany({
    where: { rmId },
    select: { status: true },
  });
  const todosFinalizados = rmItens.every(
    (i) => ["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"].includes(i.status)
  );
  if (todosFinalizados && rmItens.length > 0) {
    await prisma.rM.update({ where: { id: rmId }, data: { status: "PEDIDO_GERADO" } });
  }

  return NextResponse.json({ ok: true });
}
