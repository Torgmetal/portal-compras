import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { syncEntregas } from "@/lib/omie-recebimento";
import { comTravaDeCron } from "@/lib/cron-trava";

export const maxDuration = 120; // re-checa só os pendentes (~39) → cabe folgado

// POST — Sincroniza status de entrega com o Omie (manual via botão).
// Só os pedidos SEM entrega (os que podem mudar): rápido e corrige na hora os já
// recebidos/encerrados no Omie que apareciam como "atrasado".
export async function POST(_req) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);

    // Manual: só pendentes, SEM a varredura de NFs (pularNF — o maior custo de tempo),
    // deadline 60s << maxDuration 120s → retorna JSON com folga, sem estourar no Vercel.
    //
    // ⚠⚠ SOB A MESMA TRAVA DO CRON (chave `sync-entregas`), desde 17/09/2026: com três
    // disparadores da mesma varredura — este botão, o cron e o botão dos Prazos das RMs —
    // duas execuções sobrepostas gravariam retratos fora de ordem. Ver `lib/cron-trava.js`.
    const resultado = await comTravaDeCron(prisma, "sync-entregas", () =>
      syncEntregas(prisma, { apenasPendentes: true, pularNF: true, deadlineMs: 60_000 }));

    // ⚠ Ocupado NÃO é erro, e a tela precisa distinguir: `resultado` seria `null` e o
    // `resultado.total` do JSON quebraria aqui mesmo (achado do Codex, 17/09/2026).
    if (!resultado) {
      return NextResponse.json({ success: false, ocupado: true,
        error: "Já havia uma sincronização em andamento — tente de novo em instantes." }, { status: 409 });
    }

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
