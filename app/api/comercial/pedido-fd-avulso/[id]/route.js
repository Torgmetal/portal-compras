// DELETE — remove um FD avulso (so manuais). Pedidos gerados via
// cotacao precisam ser tratados via cancelamento normal.
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const pedido = await prisma.pedidoOmie.findUnique({ where: { id: params.id } });
  if (!pedido) return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
  if (!pedido.criadoManualmente) {
    return NextResponse.json(
      { error: "So pedidos cadastrados manualmente podem ser removidos por aqui." },
      { status: 400 }
    );
  }

  // Tenta apagar o anexo do Blob (best-effort)
  if (pedido.anexoUrl) {
    try { await del(pedido.anexoUrl); } catch { /* segue mesmo se falhar */ }
  }

  await prisma.pedidoOmie.delete({ where: { id: pedido.id } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "remover_pedido_fd_avulso",
      entity: "PedidoOmie",
      entityId: pedido.id,
      diff: { fornecedor: pedido.fornecedorNome, total: pedido.total },
    },
  });

  return NextResponse.json({ ok: true });
}
