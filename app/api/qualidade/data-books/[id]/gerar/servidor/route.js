// POST — a geração do data book tocada pelo SERVIDOR, sem depender da tela aberta (lib/databook-geracao-servidor.js).
// Quem chama: a tela (com a sessão de quem pediu) e esta própria rota, para continuar (com o CRON_SECRET).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { temCronSecret } from "@/lib/cron-auth";
import { processarGeracao } from "@/lib/databook-volumes";
import { tocarNoServidor } from "@/lib/databook-geracao-servidor";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req, { params }) {
  if (!temCronSecret(req)) {
    try { await requireRole(["ADMIN", "QUALIDADE"]); }
    catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  }
  const job = await prisma.dataBookGeracao.findFirst({
    where: { dataBookId: params.id, status: { in: ["NA_FILA", "GERANDO"] } },
    orderBy: { criadoEm: "desc" },
  });
  if (!job) return NextResponse.json({ ok: true, semJob: true });

  // ⚠ continuar = a mesma rota de novo, com o segredo dos crons. Não espera a resposta (ela só vem quando a próxima
  // rodada terminar): o pedido sai, a função nova segue sozinha. Sem CRON_SECRET, quem retoma é o cron da hora cheia.
  const relancar = async () => {
    if (!process.env.CRON_SECRET) return;
    const url = new URL(`/api/qualidade/data-books/${params.id}/gerar/servidor`, req.url);
    await fetch(url, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(3000) }).catch(() => {});
  };
  try {
    const r = await tocarNoServidor({ jobId: job.id, processar: processarGeracao, relancar });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await prisma.dataBookGeracao.update({
      where: { id: job.id },
      data: { status: "ERRO", erro: String(e?.message || e).slice(0, 500), concluidoEm: new Date() },
    }).catch(() => {});
    return NextResponse.json({ error: "Falha ao gerar o volume: " + e.message }, { status: 500 });
  }
}
