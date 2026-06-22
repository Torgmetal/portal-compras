// POST /api/diretoria/sincronizar — atualiza Contas a Pagar + a Receber do Omie
// sob demanda: botão "Sincronizar" do painel e rede de segurança ao abrir (se o
// dado estiver velho). Gate próprio (requireDiretoria) — independe de role.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";
import { sincronizarContasPagar } from "@/lib/omie-contas-pagar";
import { sincronizarContasReceber } from "@/lib/omie-contas-receber";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  // On-demand (usuário esperando): detalhe menor pra ser mais rápido — o backfill
  // de detalhe completo fica pro cron diário.
  const out = { ok: true };
  try {
    out.pagar = await sincronizarContasPagar({ incremental: true, maxDetalhe: 25, orcamentoMs: 18000 });
  } catch (e) {
    out.pagarErro = e?.message;
  }
  try {
    out.receber = await sincronizarContasReceber({ orcamentoMs: 18000 });
  } catch (e) {
    out.receberErro = e?.message;
  }
  const [sp, sr] = await Promise.all([
    prisma.omieSyncState.findUnique({ where: { id: "contapagar" }, select: { ultimoSync: true } }),
    prisma.omieSyncState.findUnique({ where: { id: "contareceber" }, select: { ultimoSync: true } }),
  ]);
  out.sync = { pagar: sp?.ultimoSync || null, receber: sr?.ultimoSync || null };
  return NextResponse.json(out);
}
