// POST — enfileira a geração do Data Book em volumes.
// GET  — o andamento + os volumes já prontos.
//
// A geração deixou de acontecer dentro do clique: um data book de 10 mil páginas não
// termina dentro de uma função serverless. Aqui só se cria o job; quem trabalha é
// /gerar/continuar (chamado pela própria tela, um volume por vez) e o cron, que
// recolhe job abandonado quando alguém fecha o navegador no meio.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { montarRoteiro } from "@/lib/databook-volumes";

export const runtime = "nodejs";
export const maxDuration = 60;

const ABERTO = ["NA_FILA", "GERANDO"];

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const book = await prisma.dataBookQualidade.findUnique({ where: { id: params.id }, select: { id: true, revisao: true } });
  if (!book) return NextResponse.json({ error: "Data book não encontrado" }, { status: 404 });

  // Job aberto para esta revisão? Devolve o mesmo — clicar duas vezes não pode gerar
  // dois conjuntos de volumes concorrentes gravando no mesmo lugar.
  const aberto = await prisma.dataBookGeracao.findFirst({
    where: { dataBookId: book.id, revisao: book.revisao, status: { in: ABERTO } },
    orderBy: { criadoEm: "desc" },
  });
  if (aberto) return NextResponse.json({ ok: true, geracao: aberto, reaproveitado: true });

  const { roteiro } = await montarRoteiro(book.id);

  // Refazer apaga os volumes da revisão: o conjunto tem que ser coerente entre si.
  // Sobrar o Volume 07 de uma geração antiga ao lado de um novo Volume 03 é pior que
  // não ter nada — o cliente baixa dois pedaços de livros diferentes.
  await prisma.dataBookArquivo.deleteMany({ where: { dataBookId: book.id, revisao: book.revisao } });

  const geracao = await prisma.dataBookGeracao.create({
    data: {
      dataBookId: book.id, revisao: book.revisao, status: "NA_FILA",
      totalItens: roteiro.length, solicitadoPor: user.name || user.email || null,
      etapa: roteiro.length ? `${roteiro.length} anexo(s) na fila` : "Sem anexos — só o livro",
    },
  });
  return NextResponse.json({ ok: true, geracao });
}

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const book = await prisma.dataBookQualidade.findUnique({ where: { id: params.id }, select: { id: true, revisao: true } });
  if (!book) return NextResponse.json({ error: "Data book não encontrado" }, { status: 404 });

  const [geracao, volumes] = await Promise.all([
    prisma.dataBookGeracao.findFirst({ where: { dataBookId: book.id }, orderBy: { criadoEm: "desc" } }),
    prisma.dataBookArquivo.findMany({
      where: { dataBookId: book.id, revisao: book.revisao },
      orderBy: { volume: "asc" },
      select: { id: true, volume: true, totalVolumes: true, titulo: true, paginas: true, tamanho: true, geradoEm: true },
    }),
  ]);
  const totais = volumes.reduce((a, v) => ({ paginas: a.paginas + v.paginas, tamanho: a.tamanho + v.tamanho }), { paginas: 0, tamanho: 0 });
  return NextResponse.json({ geracao, volumes, totais, revisao: book.revisao });
}
