import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncEntregas } from "@/lib/omie-recebimento";

export const maxDuration = 60;

// GET — Cron job que roda a cada 6h pra sincronizar entregas com o Omie.
// Protegido pelo CRON_SECRET da Vercel.
export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Em producao, Vercel envia Authorization: Bearer <CRON_SECRET>
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resultado = await syncEntregas(prisma);

    // Log de auditoria do cron (sem usuario)
    if (resultado.sincronizados > 0) {
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: "SYNC_ENTREGAS_CRON",
          entity: "PedidoOmie",
          entityId: "batch",
          diff: {
            total: resultado.total,
            sincronizados: resultado.sincronizados,
            erros: resultado.erros,
          },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      total: resultado.total,
      sincronizados: resultado.sincronizados,
      erros: resultado.erros,
    });
  } catch (e) {
    console.error("[cron/sync-entregas] Erro:", e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
