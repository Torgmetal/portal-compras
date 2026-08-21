// POST /api/qualidade/data-books/secao/[secaoId]/anexar
// Anexa um arquivo (já enviado pro Vercel Blob via /upload-token) direto a uma seção
// do data book — para conteúdo que NÃO vem do portal (relatório avulso, documento do
// cliente, etc.). Cria um DocumentoQualidade (categoria ANEXO, escopo da OP) apontando
// pro Blob e vincula à seção. O arquivo entra no PDF (merge por arquivoUrl).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

import { estaFechado, erroPrecisaRevisao } from "@/lib/databook-revisao";
export const runtime = "nodejs";

const schema = z.object({
  arquivoUrl: z.string().url(),
  arquivoNome: z.string().min(1).max(300),
  arquivoTipo: z.string().max(120).optional().nullable(),
  arquivoTamanho: z.number().int().nonnegative().optional().nullable(),
});

// Só aceita URLs do Vercel Blob público (anti-SSRF: o PDF faz fetch dessa URL).
const BLOB_OK = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i;

export async function POST(req, { params }) {
  // 🚫 DATA BOOK FECHADO NÃO SE MEXE — a trava vale em TODA rota que altera seção, não só numa.
  // Vitor (19/08/2026): "os data books emitidos não mexa em nada, é um documento". Uma rota
  // esquecida vira a porta dos fundos: o livro continua dizendo R00 enquanto o conteúdo mudou.
  // A checagem e a mensagem vêm de lib/databook-revisao pra que todas respondam igual.
  {
    const _bookSec = await prisma.dataBookSecao.findUnique({
      where: { id: params.secaoId },
      select: { dataBook: { select: { status: true, emitidoEm: true, revisao: true } } },
    });
    if (_bookSec && estaFechado(_bookSec.dataBook)) {
      return NextResponse.json(erroPrecisaRevisao(_bookSec.dataBook), { status: 409 });
    }
  }

  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  if (!BLOB_OK.test(body.arquivoUrl)) {
    return NextResponse.json({ success: false, error: "Arquivo inválido (origem não permitida)." }, { status: 400 });
  }

  const secao = await prisma.dataBookSecao.findUnique({
    where: { id: params.secaoId },
    select: { id: true, numero: true, titulo: true, dataBook: { select: { opNumero: true } } },
  });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });

  const doc = await prisma.documentoQualidade.create({
    data: {
      nome: body.arquivoNome.replace(/\.[a-z0-9]+$/i, "").slice(0, 300),
      categoria: "ANEXO",
      tipo: `Anexo — ${secao.titulo}`.slice(0, 120),
      opNumero: secao.dataBook?.opNumero || null,
      origem: "anexo_databook",
      arquivoUrl: body.arquivoUrl,
      arquivoNome: body.arquivoNome,
      arquivoTipo: body.arquivoTipo || null,
      arquivoTamanho: body.arquivoTamanho ?? null,
      validado: false,
      createdById: user.id,
    },
    select: { id: true },
  });

  await prisma.dataBookSecaoDoc.create({ data: { secaoId: params.secaoId, documentoId: doc.id } });
  await prisma.dataBookSecao.update({ where: { id: params.secaoId }, data: { estado: "ANEXADO" } });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "ANEXAR_ARQUIVO_SECAO_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: { numero: secao.numero, documentoId: doc.id, arquivoNome: body.arquivoNome } } })
    .catch(() => {});

  return NextResponse.json({ success: true, documentoId: doc.id });
}
