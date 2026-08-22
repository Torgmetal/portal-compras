// Cron — recolhe geração de Data Book abandonada e continua até acabar.
//
// A tela do usuário é quem normalmente toca a geração (um volume por chamada). Se
// alguém fecha o navegador na metade, o job fica parado com o cursor gravado; este
// cron é quem termina. Trabalha vários volumes por invocação, até perto do teto de
// tempo da função.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { registrarExecucao } from "@/lib/cron-monitor";
import { processarGeracao } from "@/lib/databook-volumes";

export const runtime = "nodejs";
export const maxDuration = 300;

// só mexe em job parado — se a tela está tocando, não atropela
const OCIOSO_MS = 3 * 60_000;
const ORCAMENTO_MS = 240_000;

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  await aquecerBanco(prisma);

  const feitos = [];
  try {
    while (Date.now() - t0 < ORCAMENTO_MS) {
      const job = await prisma.dataBookGeracao.findFirst({
        where: { status: { in: ["NA_FILA", "GERANDO"] }, atualizadoEm: { lt: new Date(Date.now() - OCIOSO_MS) } },
        orderBy: { criadoEm: "asc" },
      });
      if (!job) break;
      try {
        const r = await processarGeracao(job.id);
        feitos.push({ job: job.id, ...r });
        if (r.concluido) continue;
      } catch (e) {
        await prisma.dataBookGeracao.update({
          where: { id: job.id },
          data: { status: "ERRO", erro: String(e?.message || e).slice(0, 500), concluidoEm: new Date() },
        });
        feitos.push({ job: job.id, erro: e.message });
      }
    }
    await registrarExecucao("data-book", { ok: true, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, volumes: feitos.length, feitos });
  } catch (e) {
    await registrarExecucao("data-book", { ok: false, mensagem: e.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
