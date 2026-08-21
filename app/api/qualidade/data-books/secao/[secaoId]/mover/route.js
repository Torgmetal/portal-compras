// POST — move documentos desta seção para a seção CERTA do mesmo data book.
//
// Vitor (20/08/2026): "você está trazendo certificados de tinta na aba de certificados de
// materiais". Era o "ENDURECEDOR PARA INDUSTHANE 35.010" na §04 (matéria-prima) da OP-067 —
// vínculo automático feito antes de existir o filtro por grupo.
//
// O portal já não erra mais na hora de vincular, mas o que está gravado continua gravado. Em vez
// de sumir com o vínculo sem avisar (o certificado sumiria do data book sem ninguém entender),
// a tela aponta a seção certa e este endpoint faz a mudança quando a pessoa mandar.
//
// 🚫 Só move DENTRO do mesmo data book, e só o que o classificador aponta como fora do grupo —
// não é um "mover qualquer documento pra qualquer seção".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { secaoCertaDoDoc } from "@/lib/databook-secoes";
import { fichasPorR, comFicha } from "@/lib/databook-ficha-r";
import { estaFechado, erroPrecisaRevisao } from "@/lib/databook-revisao";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { secaoId } = await params;
  const secao = await prisma.dataBookSecao.findUnique({
    where: { id: secaoId },
    select: {
      id: true, numero: true,
      dataBook: { select: { id: true, opNumero: true, status: true, emitidoEm: true, revisao: true } },
    },
  });
  if (!secao) return NextResponse.json({ error: "Seção não encontrada" }, { status: 404 });
  if (estaFechado(secao.dataBook)) return NextResponse.json(erroPrecisaRevisao(secao.dataBook), { status: 409 });

  let body = {};
  try { body = await req.json(); } catch { /* sem corpo = move todos os fora do grupo */ }
  const alvoIds = Array.isArray(body?.documentoIds) ? body.documentoIds : null;

  const vinculos = await prisma.dataBookSecaoDoc.findMany({
    where: { secaoId, ...(alvoIds ? { documentoId: { in: alvoIds } } : {}) },
    select: { documentoId: true },
  });
  if (!vinculos.length) return NextResponse.json({ error: "Nada para mover." }, { status: 400 });

  const docs = await prisma.documentoQualidade.findMany({
    where: { id: { in: vinculos.map((v) => v.documentoId) } },
    select: { id: true, nome: true, categoria: true, importRef: true },
  });
  const fichas = await fichasPorR(docs, secao.dataBook.opNumero);

  // agrupa por seção-destino; um documento pode ir pra §15 e outro pra §06 na mesma tacada
  const porDestino = new Map();
  for (const d of docs) {
    const destino = secaoCertaDoDoc(comFicha(d, fichas), secao.numero);
    if (!destino) continue;
    if (!porDestino.has(destino)) porDestino.set(destino, []);
    porDestino.get(destino).push(d.id);
  }
  if (!porDestino.size) return NextResponse.json({ error: "Nenhum documento desta seção está fora do grupo." }, { status: 400 });

  const secoesDestino = await prisma.dataBookSecao.findMany({
    where: { dataBookId: secao.dataBook.id, numero: { in: [...porDestino.keys()] } },
    select: { id: true, numero: true, estado: true },
  });
  const idPorNumero = new Map(secoesDestino.map((s) => [s.numero, s]));

  const movidos = [];
  const semSecao = [];
  for (const [numero, ids] of porDestino) {
    const destino = idPorNumero.get(numero);
    // ⚠ a seção-destino pode não existir neste data book (marcada N/A e removida, modelo antigo).
    // Nesse caso NÃO desvincula: tirar da §04 sem ter pra onde levar apagaria o certificado do livro.
    if (!destino) { semSecao.push({ numero, quantos: ids.length }); continue; }
    await prisma.$transaction([
      prisma.dataBookSecaoDoc.createMany({
        data: ids.map((documentoId) => ({ secaoId: destino.id, documentoId })),
        skipDuplicates: true,
      }),
      prisma.dataBookSecaoDoc.deleteMany({ where: { secaoId, documentoId: { in: ids } } }),
      prisma.dataBookSecao.update({ where: { id: destino.id }, data: { estado: "ANEXADO" } }),
    ]);
    movidos.push({ numero, quantos: ids.length });
  }

  // a seção de origem pode ter ficado vazia
  const restam = await prisma.dataBookSecaoDoc.count({ where: { secaoId } });
  if (!restam) await prisma.dataBookSecao.update({ where: { id: secaoId }, data: { estado: "PENDENTE" } });

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "MOVER_DOC_SECAO_DATABOOK", entity: "DataBookSecao", entityId: secaoId,
      diff: { de: secao.numero, movidos, semSecao },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, movidos, semSecao, total: movidos.reduce((a, m) => a + m.quantos, 0) });
}
