// GET /api/cron/backup-arquivos — segunda cópia, no SharePoint, do que só existia no Vercel Blob:
// anexos do Data Book e fotos de inspeção (lib/backup-arquivos.js).
//
// ⚠ Toda madrugada, e só o que ainda não tem cópia. A primeira leva (616 arquivos, 24/09/2026) pode
// levar mais de uma noite: o job para aos 240 s e o resto fica para a seguinte — o placar diz quanto.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { registrarExecucao } from "@/lib/cron-monitor";
import { copiarArquivosSemBackup } from "@/lib/backup-arquivos";
import { prisma } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req) {
  if (!temCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const p = await copiarArquivosSemBackup();
    // ⚠ arquivo que não baixa do Blob é EXATAMENTE o que este backup existe para descobrir — então
    // falha deixa o heartbeat vermelho, com o primeiro motivo à vista
    await registrarExecucao("backup-arquivos", {
      ok: !p.falhas.length,
      duracaoMs: Date.now() - t0,
      mensagem: `copiados ${p.anexos} anexo(s) de Data Book e ${p.fotos} foto(s)`
        + (p.adiados ? ` · ${p.adiados} ficaram para a próxima noite` : "")
        + (p.falhas.length ? ` · ${p.falhas.length} FALHA(S): ${p.falhas[0].tipo} ${p.falhas[0].id} — ${p.falhas[0].erro}` : ""),
    }).catch(() => {});
    return NextResponse.json({ ok: true, ...p, falhas: p.falhas.length ? p.falhas : undefined });
  } catch (e) {
    await registrarExecucao("backup-arquivos", {
      ok: false, duracaoMs: Date.now() - t0, mensagem: String(e?.message || e).slice(0, 200),
    }).catch(() => {});
    return NextResponse.json({ error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
