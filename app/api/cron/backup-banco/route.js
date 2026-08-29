// GET /api/cron/backup-banco — dump semanal do banco para o SharePoint.
//
// ⚠⚠ É A ÚNICA CÓPIA DO BANCO FORA DO NEON. Código e documentos já tinham duas casas (GitHub, e
// SharePoint ao lado do Blob); o banco não tinha nenhuma. Como o desenvolvimento roda contra a
// PRODUÇÃO, sem staging, o estrago mais provável não é invasão — é um script errado numa
// segunda-feira, e a janela de restauração do Neon é o que houver no plano contratado.
//
// ⚠ Roda domingo de madrugada: 196 MB e 133 tabelas levam minutos e competem por conexão com o
// resto do portal. Domingo 4h não disputa com ninguém.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { registrarExecucao } from "@/lib/cron-monitor";
import { rodarBackup, PASTA_BACKUP } from "@/lib/backup-banco";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// o teto da plataforma: o backup inteiro leva alguns minutos e não há como partir em dois sem que
// o resultado deixe de ser um retrato do mesmo instante.
export const maxDuration = 300;

export async function GET(req) {
  if (!temCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const manifesto = await rodarBackup();
    const mb = Math.round(manifesto.totalBytes / 1024 / 1024);
    await registrarExecucao("backup-banco", {
      ok: !manifesto.falhas.length,
      duracaoMs: Date.now() - t0,
      mensagem: `${manifesto.totalTabelas} tabelas · ${manifesto.totalLinhas} linhas · ${mb} MB`
        + (manifesto.falhas.length ? ` · FALHOU em ${manifesto.falhas.map((f) => f.tabela).join(", ")}` : ""),
    }).catch(() => {});
    return NextResponse.json({
      ok: true, pasta: PASTA_BACKUP,
      tabelas: manifesto.totalTabelas, linhas: manifesto.totalLinhas, megabytes: mb,
      segundos: manifesto.duracaoSegundos,
      falhas: manifesto.falhas.length ? manifesto.falhas : undefined,
    });
  } catch (e) {
    // ⚠ backup que falha calado é o pior dos mundos — parece existir. 500 para o monitor ver.
    await registrarExecucao("backup-banco", {
      ok: false, duracaoMs: Date.now() - t0, mensagem: String(e?.message || e).slice(0, 200),
    }).catch(() => {});
    return NextResponse.json({ error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
