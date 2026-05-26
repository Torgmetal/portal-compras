import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { syncEntregas } from "@/lib/omie-recebimento";

export const maxDuration = 60; // pode demorar com muitos pedidos

// POST — Sincroniza status de entrega com o Omie (manual via botão)
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);

    const resultado = await syncEntregas(prisma);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "SYNC_ENTREGAS_MANUAL",
        entity: "PedidoOmie",
        entityId: "batch",
        diff: {
          total: resultado.total,
          sincronizados: resultado.sincronizados,
          erros: resultado.erros,
        },
      },
    });

    return NextResponse.json({ success: true, ...resultado });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
