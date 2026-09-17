import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { syncEntregas } from "@/lib/omie-recebimento";
import { comTravaDeCron } from "@/lib/cron-trava";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { log } from "@/lib/log";

const registro = log("api/cron/sync-entregas");

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
    // Acorda a compute do Neon (scale-to-zero) antes do 1º query — evita o P1001
    // "Can't reach database server" no cold start (cron diário, compute ociosa).
    await aquecerBanco(prisma);
    // ⚠⚠ A MESMA TRAVA DOS DISPAROS MANUAIS (chave `sync-entregas`). Desde 17/09/2026 a tela
    // Prazos das RMs também dispara esta varredura por botão, e a tela Cronograma já disparava:
    // sem uma vez compartilhada, duas execuções gravariam retratos fora de ordem, a mais lenta
    // por cima da mais nova. Ver `lib/cron-trava.js`.
    const resultado = await comTravaDeCron(prisma, "sync-entregas", () => syncEntregas(prisma));
    // ⚠ Pulado não é sucesso mudo: o heartbeat tem de dizer que esta execução não fez trabalho.
    if (!resultado) {
      await registrarExecucao("sync-entregas", { ok: true, duracaoMs: Date.now() - t0,
        mensagem: "pulou — outra sincronização de entregas já estava rodando" });
      return NextResponse.json({ ok: true, pulou: true });
    }
    const msg = `${resultado.sincronizados} entregas · ${resultado.processados}/${resultado.total} verificados${resultado.timeboxed ? " (parcial — resto na próxima)" : ""}`;
    await registrarExecucao("sync-entregas", { ok: true, duracaoMs: Date.now() - t0, mensagem: msg });

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
    registro.erro("[cron/sync-entregas] Erro:", e.message);
    await registrarExecucao("sync-entregas", { ok: false, mensagem: e.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
