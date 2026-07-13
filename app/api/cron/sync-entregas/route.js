import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { syncEntregas } from "@/lib/omie-recebimento";
import { registrarExecucao } from "@/lib/cron-monitor";

export const maxDuration = 300; // a varredura de NFs + consulta por pedido no Omie passava de 60s (504)

// GET — Cron job (diário) que sincroniza entregas com o Omie.
// Auth: user-agent vercel-cron OU Bearer CRON_SECRET (igual aos outros crons) —
// antes só checava o Bearer; sem CRON_SECRET setado a rota ficava aberta.
export async function GET(req) {
  // Só Bearer CRON_SECRET (User-Agent é spoofável — SEC-01).
  const isCron = temCronSecret(req);
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const resultado = await syncEntregas(prisma);
    await registrarExecucao("sync-entregas", { ok: true, duracaoMs: Date.now() - t0, mensagem: `${resultado.sincronizados}/${resultado.total} sincronizados` });

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
    await registrarExecucao("sync-entregas", { ok: false, mensagem: e.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
