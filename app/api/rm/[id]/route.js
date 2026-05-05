import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// DELETE — exclusao definitiva da RM. Bloqueia se ja gerou pedido no Omie (status="CRIADO").
// Cascateia: itens, cotacoes (e seus itens, anexos), envios, anexos da RM, pedidos com status="ERRO".
export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin pode excluir RMs." }, { status: 403 });
  }

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: {
      cotacoes: {
        select: {
          id: true,
          pedidosOmie: { select: { id: true, status: true, numeroPedido: true } },
        },
      },
      _count: { select: { itens: true, cotacoes: true, envios: true, anexos: true } },
    },
  });
  if (!rm) return NextResponse.json({ error: "RM nao encontrada." }, { status: 404 });

  // Bloqueia se algum pedido foi efetivamente criado no Omie
  const pedidosCriados = rm.cotacoes.flatMap((c) =>
    c.pedidosOmie.filter((p) => p.status === "CRIADO")
  );
  if (pedidosCriados.length > 0) {
    const numeros = pedidosCriados.map((p) => p.numeroPedido || p.id).join(", ");
    return NextResponse.json(
      {
        error:
          `Nao da pra excluir: a RM ${rm.numero} ja gerou ${pedidosCriados.length} pedido(s) no Omie ` +
          `(${numeros}). Use 'Cancelar' pra arquivar mantendo o historico.`,
      },
      { status: 409 }
    );
  }

  // IDs de pedidos com status="ERRO" (vinculados as cotacoes dessa RM) — vamos apagar tambem
  const pedidosErroIds = rm.cotacoes.flatMap((c) =>
    c.pedidosOmie.filter((p) => p.status !== "CRIADO").map((p) => p.id)
  );

  await prisma.$transaction(async (tx) => {
    // 1. Limpa referencia de RMItem -> PedidoOmie pra nao quebrar FK
    await tx.rMItem.updateMany({
      where: { rmId: rm.id, pedidoOmieId: { not: null } },
      data: { pedidoOmieId: null },
    });

    // 2. Apaga pedidos com erro vinculados a essa RM (auditoria preservada nos pedidos CRIADOs, mas aqui nao tem)
    if (pedidosErroIds.length > 0) {
      await tx.pedidoOmie.deleteMany({ where: { id: { in: pedidosErroIds } } });
    }

    // 3. Apaga a RM — cascades cuidam de RMItem, Cotacao (e seus itens/anexos), Envio, Anexo
    await tx.rM.delete({ where: { id: rm.id } });
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_rm",
      entity: "RM",
      entityId: rm.id,
      diff: {
        numero: rm.numero,
        opId: rm.opId,
        itens: rm._count.itens,
        cotacoes: rm._count.cotacoes,
        envios: rm._count.envios,
        anexos: rm._count.anexos,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
