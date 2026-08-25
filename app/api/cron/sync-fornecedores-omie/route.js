// Cron Vercel — sincroniza os fornecedores do Omie (tag "Fornecedor") para a Vendor List.
// Roda 1x/dia (config em vercel.json). Autenticação via Bearer CRON_SECRET.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { sincronizarFornecedoresOmie } from "@/lib/omie-fornecedores";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    await aquecerBanco(prismaDirect).catch(() => {});
    const r = await sincronizarFornecedoresOmie({ dryRun: false });
    await registrarExecucao("sync-fornecedores-omie", { ok: true, duracaoMs: Date.now() - t0, mensagem: `total ${r.total} · novos ${r.novos} · vinc ${r.vinculados} · semEmail ${r.semEmail} · funcRemov ${r.removidos}` });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron sync-fornecedores-omie] erro:", e?.message);
    await registrarExecucao("sync-fornecedores-omie", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
