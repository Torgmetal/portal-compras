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
export const maxDuration = 60;

// ⚠⚠ O PRAZO DA LEITURA DO OMIE CONTA DO INÍCIO DA REQUISIÇÃO, não de depois de acordar o banco. Morta
// por timeout da Vercel, a função não chega ao `catch` e o monitor fica sem registro — a falha voltaria
// a ser invisível. Os 20 s que sobram são para gravar os ~650 itens e bater o ponto.
const PRAZO_MS = 40_000;

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
