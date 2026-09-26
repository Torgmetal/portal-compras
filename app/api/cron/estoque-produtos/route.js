// Cron Vercel — sincroniza produtos do Omie das categorias configuradas.
// Roda 1x/hora (config em vercel.json). Autenticacao via header Vercel-Cron.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { sincronizarProdutos } from "@/lib/omie-estoque";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { log } from "@/lib/log";

const registro = log("api/cron/estoque-produtos");

export const runtime = "nodejs";
// ⚠⚠ 300 s, NÃO 60 (26/09/2026). Com 60 a rodada das 12h foi MORTA no meio da gravação — 508 dos 657
// itens, sem ponto no monitor, sem os locais na configuração — e o código antigo já vivia no limite
// (8h: 59,8 s; 9h, 10h e 11h sem registro). A leitura do Omie chegou a 39 s e as ~650 gravações pedem
// ~27 s. Morta por timeout, a função não chega ao `catch`: a falha volta a ser invisível.
export const maxDuration = 300;

// O PRAZO DA LEITURA DO OMIE CONTA DO INÍCIO DA REQUISIÇÃO, não de depois de acordar o banco, e deixa
// 2 min para gravar e bater o ponto.
const PRAZO_MS = 180_000;

export async function GET(req) {
  // Só autoriza com Bearer CRON_SECRET (a Vercel injeta nas invocações de cron).
  // NÃO confia no User-Agent — é spoofável (SEC-01).
  const isCron = temCronSecret(req);
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    // Acorda a compute do Neon (scale-to-zero) antes do 1º query — evita o P1001
    // "Can't reach database server" no cold start. Aquece pooler e conexão direta.
    await aquecerBanco(prisma);
    await aquecerBanco(prismaDirect).catch(() => {});
    const r = await sincronizarProdutos({ ateMs: t0 + PRAZO_MS });
    await registrarExecucao("estoque-produtos", { ok: true, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    registro.erro("[cron estoque-produtos] erro:", e?.message);
    await registrarExecucao("estoque-produtos", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
