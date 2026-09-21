// POST — o botão "Sincronizar" da tela `Compras › Prazos das RMs`.
//
// Matheus (17/09/2026): "para quando eu receber alguns pedidos e quiser sincronizar eu conseguir
// sem precisar esperar o cron". A regra inteira mora em `lib/sincronismo-prazos.js`; aqui ficam
// autorização, intervalo mínimo, auditoria e a resposta.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { reservarVez, renovarVez, soltarVez } from "@/lib/cron-trava";
import { aquecerBanco } from "@/lib/db-retry";
import {
  sincronizarPrazos, resumoDoSincronismo, deuCerto, rodouAlgo,
  JOB_MANUAL, INTERVALO_MANUAL_MS, RESERVA_DURANTE_MS,
} from "@/lib/sincronismo-prazos";

export const runtime = "nodejs";
// ⚠ O orçamento interno para em 150s (`ORCAMENTO.total`); os ~30s de folga são para gravar,
// auditar, soltar as travas e devolver o JSON. Estourar o `maxDuration` faz a Vercel responder
// uma página de ERRO EM HTML, e o `res.json()` do navegador quebra com "Unexpected token 'A'" —
// erro que não diz nada a quem clicou.
export const maxDuration = 180;

export async function POST() {
  const t0 = Date.now();
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  // ⚠⚠ O AQUECIMENTO VEM ANTES DA RESERVA (achado do Codex, 17/09/2026): a reserva JÁ É um query,
  // e com a compute do Neon dormindo ela estouraria com P1001 fora do tratamento — devolvendo
  // erro de servidor no lugar da resposta que a tela sabe ler.
  try {
    await aquecerBanco(prisma);
  } catch (e) {
    return NextResponse.json({ success: false, error: `O banco não respondeu: ${e.message}` }, { status: 503 });
  }

  // ⚠⚠ INTERVALO MÍNIMO ANTES DE QUALQUER TRABALHO. A trava de execução impede duas varreduras
  // ao mesmo tempo, mas não impede a segunda logo depois da primeira — e cada rodada gasta
  // dezenas de chamadas numa API com limite de 3 req/s (achado do Codex, 17/09/2026).
  //
  // ⚠ Reserva pela JANELA DE EXECUÇÃO, não pelo intervalo: a vez precisa durar mais que a rodada,
  // senão ela vence no meio e outra execução assume (ver `RESERVA_DURANTE_MS`). O intervalo de
  // verdade é aplicado no fim, por `renovarVez`.
  const vez = await reservarVez(prisma, JOB_MANUAL, RESERVA_DURANTE_MS);
  if (!vez.ok) {
    // ⚠ A conta de quanto falta é do PRÓPRIO Postgres (ver `reservarVez`): fazê-la aqui
    // compararia a data dele com o relógio desta máquina, e as duas nem sempre batem.
    const faltam = vez.faltamSegundos;
    return NextResponse.json({
      success: false, esperando: true, esperarSegundos: faltam,
      error: faltam
        ? `Sincronizado há pouco. Tente de novo em ${faltam}s.`
        : "Sincronizado há pouco. Tente de novo em instantes.",
    }, { status: 429 });
  }

  try {
    const r = await sincronizarPrazos(prisma, { t0 });

    // ⚠ Nada rodou porque os DOIS crons estavam na vez? Então nenhuma chamada ao Omie foi gasta
    // e não há por que fazer a pessoa esperar dois minutos por um clique que não fez nada.
    //
    // ⚠⚠ RODOU? ENTÃO O INTERVALO COMEÇA A CONTAR AGORA, não lá atrás. Medido em 17/09/2026: a
    // rodada levou 111s e a reserva feita no início deixava só 10s de espera — ou seja, o
    // intervalo mínimo sumia justamente nas rodadas longas, que são as caras.
    if (rodouAlgo(r)) await renovarVez(prisma, JOB_MANUAL, INTERVALO_MANUAL_MS);
    else await soltarVez(prisma, JOB_MANUAL);

    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "SYNC_PRAZOS_MANUAL", entity: "PedidoOmie", entityId: "batch",
        diff: { entregas: r.entregas, encerrados: r.encerrados, duracaoMs: Date.now() - t0 },
      },
      // ⚠ Bookkeeping não desfaz sincronização: falhar ao registrar não apaga o que já foi gravado.
    }).catch(() => {});

    return NextResponse.json({ success: deuCerto(r), mensagem: resumoDoSincronismo(r), ...r });
  } catch (e) {
    // ⚠ Erro inesperado devolve a vez: fazer a pessoa esperar 2 min por uma rodada que explodiu
    // seria punir o usuário pelo defeito.
    await soltarVez(prisma, JOB_MANUAL);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
