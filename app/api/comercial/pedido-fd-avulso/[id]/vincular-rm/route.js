// PATCH /api/comercial/pedido-fd-avulso/:id/vincular-rm
// Vincula um FD avulso ja cadastrado a uma RM, marcando-a como PEDIDO_GERADO.
// rmAtendidaId no body pode ser null pra desvincular.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  rmAtendidaId: z.string().nullable(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  const pedido = await prisma.pedidoOmie.findUnique({
    where: { id: params.id },
    include: { rmAtendida: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
  if (!pedido.criadoManualmente) {
    return NextResponse.json(
      { error: "Esse endpoint so funciona pra FDs avulsos manuais." },
      { status: 400 }
    );
  }

  const rmAtendidaIdAntiga = pedido.rmAtendidaId;
  let rmNova = null;

  // Valida a nova RM (se foi informada)
  if (body.rmAtendidaId) {
    rmNova = await prisma.rM.findFirst({
      where: { id: body.rmAtendidaId, opId: pedido.opId },
      select: { id: true, numero: true, status: true },
    });
    if (!rmNova) {
      return NextResponse.json(
        { error: "RM nao encontrada ou nao pertence a essa OP." },
        { status: 400 }
      );
    }
  }

  // Atualiza o pedido
  await prisma.pedidoOmie.update({
    where: { id: pedido.id },
    data: { rmAtendidaId: body.rmAtendidaId || null },
  });

  // Se TEM RM nova: marca itens dela como PEDIDO_GERADO + status RM
  if (rmNova) {
    await prisma.rMItem.updateMany({
      where: {
        rmId: rmNova.id,
        status: { notIn: ["CANCELADO", "PEDIDO_GERADO"] },
      },
      data: {
        status: "PEDIDO_GERADO",
        pedidoOmieId: pedido.id,
      },
    });
    await prisma.rM.update({
      where: { id: rmNova.id },
      data: { status: "PEDIDO_GERADO" },
    });
  }

  // Se TINHA outra RM antes: reverter o status dela (volta pra COTADA
  // se tem cotacao RECEBIDA, senao EM_COTACAO ou ABERTA)
  if (rmAtendidaIdAntiga && rmAtendidaIdAntiga !== body.rmAtendidaId) {
    // Desvincula os RMItens dela que estavam apontando pra esse pedido
    await prisma.rMItem.updateMany({
      where: { rmId: rmAtendidaIdAntiga, pedidoOmieId: pedido.id },
      data: { status: "COTADO", pedidoOmieId: null },
    });
    // Volta status da RM antiga
    await prisma.rM.update({
      where: { id: rmAtendidaIdAntiga },
      data: { status: "COTADA" },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "vincular_fd_rm",
      entity: "PedidoOmie",
      entityId: pedido.id,
      diff: {
        antes: { rmAtendidaId: rmAtendidaIdAntiga },
        depois: { rmAtendidaId: body.rmAtendidaId, rmNumero: rmNova?.numero || null },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    rmNumero: rmNova?.numero || null,
  });
}
