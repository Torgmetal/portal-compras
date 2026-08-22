// POST — trabalha UM volume do job aberto e devolve o andamento.
//
// É a tela que chama isto em laço enquanto o usuário olha a barra de progresso. Cada
// chamada fecha um volume e grava o cursor, então fechar o navegador no meio não
// perde nada: o cron retoma exatamente de onde parou.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { processarGeracao } from "@/lib/databook-volumes";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const job = await prisma.dataBookGeracao.findFirst({
    where: { dataBookId: params.id, status: { in: ["NA_FILA", "GERANDO"] } },
    orderBy: { criadoEm: "desc" },
  });
  if (!job) return NextResponse.json({ ok: true, semJob: true });

  try {
    const r = await processarGeracao(job.id);
    const atual = await prisma.dataBookGeracao.findUnique({ where: { id: job.id } });
    return NextResponse.json({ ok: true, ...r, geracao: atual });
  } catch (e) {
    await prisma.dataBookGeracao.update({
      where: { id: job.id },
      data: { status: "ERRO", erro: String(e?.message || e).slice(0, 500), concluidoEm: new Date() },
    });
    return NextResponse.json({ error: "Falha ao gerar o volume: " + e.message }, { status: 500 });
  }
}
