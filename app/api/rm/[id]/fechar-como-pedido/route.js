// Forca fechamento de uma RM como PEDIDO_GERADO, mesmo quando alguns itens
// ficaram em estado intermediario (COTADO/EM_COTACAO/PENDENTE) — esses itens
// sao cancelados com motivo "Nao selecionado pra pedido".
//
// Usado quando o usuario ja gerou pedido no Omie pros itens que queria e quer
// marcar a RM como fechada, descartando os leftovers.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras." }, { status: 403 });
  }

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: { itens: { select: { id: true, status: true } } },
  });
  if (!rm) return NextResponse.json({ error: "RM não encontrada." }, { status: 404 });
  if (rm.status === "PEDIDO_GERADO") {
    return NextResponse.json({ error: "RM já está marcada como Pedido Gerado." }, { status: 409 });
  }
  if (rm.status === "CANCELADA") {
    return NextResponse.json({ error: "RM está cancelada. Não pode marcar como pedido gerado." }, { status: 409 });
  }

  const itensPraCancelar = rm.itens.filter((i) =>
    i.status === "PENDENTE" || i.status === "EM_COTACAO" || i.status === "COTADO"
  );
  const itensJaPedido = rm.itens.filter((i) => i.status === "PEDIDO_GERADO");
  if (itensJaPedido.length === 0) {
    return NextResponse.json({
      error: "Nenhum item desta RM virou pedido ainda. Gere pedido no Omie pra pelo menos 1 item antes de fechar."
    }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    if (itensPraCancelar.length > 0) {
      await tx.rMItem.updateMany({
        where: { id: { in: itensPraCancelar.map((i) => i.id) } },
        data: {
          status: "CANCELADO",
          canceladoMotivo: "Não selecionado pra pedido — RM fechada como Pedido Gerado",
          canceladoEm: new Date(),
        },
      });
    }
    await tx.rM.update({
      where: { id: params.id },
      data: { status: "PEDIDO_GERADO" },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "fechar_rm_como_pedido_gerado",
        entity: "RM",
        entityId: params.id,
        diff: {
          itensJaPedido: itensJaPedido.length,
          itensCancelados: itensPraCancelar.length,
        },
      },
    });
  });

  return NextResponse.json({
    ok: true,
    itensJaPedido: itensJaPedido.length,
    itensCancelados: itensPraCancelar.length,
  });
}
