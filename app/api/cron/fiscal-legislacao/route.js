import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { temCronSecret } from "@/lib/cron-auth";
import { registrarExecucao } from "@/lib/cron-monitor";
import { importarLegislacao } from "@/lib/fiscal/importar-legislacao";

// ⚠⚠ `force-dynamic` OU O CRON É PRÉ-RENDERIZADO E NUNCA RODA. Um `GET()` sem `req` e sem
// `headers()` vira rota ESTÁTICA (`○`) no build do Next: ele executa uma vez durante o build e
// serve a resposta congelada para sempre. Já aconteceu com o cron da TIPI neste mesmo módulo.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  // ⚠⚠ O RELÓGIO COMEÇA NA ENTRADA DA ROTA, NÃO DEPOIS DO AQUECIMENTO (achado do Codex,
  // 23/09/2026). Eu marcava o `t0` DEPOIS do `aquecerBanco`, cujos retries de cold start somam até
  // ~16 s — e aí o lote ainda recebia 50 s inteiros, estourando os 60 s da rota justamente no dia
  // em que a compute do Neon estava dormindo. Orçamento que não conta o que já foi gasto não é
  // orçamento.
  const t0 = Date.now();
  if (!temCronSecret(req)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // ⚠ Cold start do Neon: o primeiro query estoura antes de a compute acordar.
  await aquecerBanco(prisma);
  // ⚠ Os 5 s que sobram são para gravar o heartbeat e responder — morrer na última linha também é
  // morrer.
  const r = await importarLegislacao({ ateMs: t0 + 50_000 });

  // ⚠⚠ O PONTO É BATIDO MESMO COM FALHA DE COLETA — senão o cron "congela" e o monitor alerta por
  // não ter notícia dele, quando na verdade ele rodou e a SEFAZ é que não respondeu. O que NÃO
  // pode é um lote incompleto passar por sucesso: fonte não processada conta como falha.
  const incompleto = r.falhas.length > 0 || r.naoProcessadas.length > 0;
  await registrarExecucao("fiscal-legislacao", {
    ok: !incompleto,
    duracaoMs: Date.now() - t0,
    mensagem: `${r.importadas} importadas · ${r.semMudanca} sem mudança`
      + (r.falhas.length ? ` · ${r.falhas.length} falhas` : "")
      + (r.naoProcessadas.length ? ` · ${r.naoProcessadas.length} sem tempo` : ""),
  }).catch(() => {});
  return NextResponse.json({ success: true, ...r });
}
