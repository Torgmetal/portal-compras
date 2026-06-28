// Cron Vercel — sync financeiro consolidado: Contas a Pagar + a Receber numa
// execução só. Junta os dois (antes eram crons separados às 7:30 e 7:45) pra
// garantir que o a receber rode junto com o a pagar e reduzir contenção no Omie
// (o a receber vinha ficando dias atrasado). Auth via vercel-cron ou CRON_SECRET.
import { NextResponse } from "next/server";
import { sincronizarContasPagar } from "@/lib/omie-contas-pagar";
import { sincronizarContasReceber } from "@/lib/omie-contas-receber";
import { registrarExecucao } from "@/lib/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 120; // pagar+receber juntos chegam a ~60s; folga p/ não cortar

function autorizado(req) {
  const auth = req.headers.get("authorization") || "";
  const ua = req.headers.get("user-agent") || "";
  return ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req) {
  if (!autorizado(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const out = { ok: true };
  try {
    out.pagar = await sincronizarContasPagar({ incremental: true, maxDetalhe: 60, orcamentoMs: 28000 });
  } catch (e) {
    out.pagarErro = e?.message;
    console.error("[cron financeiro] pagar:", e?.message);
  }
  try {
    out.receber = await sincronizarContasReceber({ orcamentoMs: 24000 });
  } catch (e) {
    out.receberErro = e?.message;
    console.error("[cron financeiro] receber:", e?.message);
  }
  await registrarExecucao("financeiro", { ok: !out.pagarErro && !out.receberErro, mensagem: out.pagarErro || out.receberErro || null });
  return NextResponse.json(out);
}
