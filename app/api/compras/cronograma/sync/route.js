import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { syncEntregas } from "@/lib/omie-recebimento";

export const maxDuration = 120; // re-checa só os pendentes (~39) → cabe folgado

// POST — Sincroniza status de entrega com o Omie (manual via botão).
// Só os pedidos SEM entrega (os que podem mudar): rápido e corrige na hora os já
// recebidos/encerrados no Omie que apareciam como "atrasado".
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);

    // deadline 90s < maxDuration 120s: garante retorno JSON antes de o Vercel matar a função.
    const resultado = await syncEntregas(prisma, { apenasPendentes: true, deadlineMs: 90_000 });

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
