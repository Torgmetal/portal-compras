// Cron Vercel — marca no portal os pedidos de compra que o Omie já ENCERROU, para a tela
// `Compras › Prazos das RMs` parar de cobrar prazo deles (Matheus, 17/09/2026).
//
// ⚠⚠ CRON PRÓPRIO, E NÃO UMA LINHA A MAIS NO `sync-entregas`. O sync já faz uma varredura pesada
// de NFs ANTES do laço, sem checagem de deadline, e trabalha num timebox de 210s — pendurar outra
// varredura paginada ali era trocar um problema por um cron que morre no meio (achado do Codex,
// 17/09/2026). Aqui a varredura é a única coisa que roda, com orçamento próprio e heartbeat próprio.
//
// ⚠ NÃO baixa item nem escreve status de entrega: encerrar é ato administrativo, receber é outra
// coisa. Ver `lib/omie-encerramento.js`.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { reconciliarEncerramentos } from "@/lib/omie-encerramento";
import { log } from "@/lib/log";

const registro = log("api/cron/omie-encerrados");

export const runtime = "nodejs";
export const maxDuration = 120; // ~8 páginas do Omie com retry cabem folgado; 60s era apertado

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const r = await reconciliarEncerramentos(prisma);
    // ⚠ Coleta incompleta é AVISO, não sucesso mudo: nessa rodada nada foi desmarcado de
    // propósito, e quem lê o heartbeat precisa saber que o retrato do Omie veio pela metade.
    const msg = `${r.marcados} encerrado(s) novo(s) · ${r.desmarcados} reaberto(s) · ${r.total} pedidos`
      + (r.completa ? "" : ` ⚠ coleta incompleta (${r.motivo}) — nada desmarcado`);
    await registrarExecucao("omie-encerrados", { ok: true, duracaoMs: Date.now() - t0, mensagem: msg });

    if (r.marcados || r.desmarcados) {
      await prisma.auditLog.create({
        data: {
          userId: null, action: "SYNC_ENCERRADOS_OMIE", entity: "PedidoOmie", entityId: "batch",
          diff: { marcados: r.marcados, desmarcados: r.desmarcados, total: r.total, completa: r.completa },
        },
      }).catch(() => {}); // bookkeeping nunca derruba o cron
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    registro.erro("[cron omie-encerrados] erro:", e?.message);
    await registrarExecucao("omie-encerrados", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
