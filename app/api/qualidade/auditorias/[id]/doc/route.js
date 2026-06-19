// POST   /api/qualidade/auditorias/[id]/doc   — anexa um documento (upload Blob OU vínculo
//        a um DocumentoQualidade existente). tipo: SOLICITACAO (pedido do cliente) | EVIDENCIA.
// DELETE /api/qualidade/auditorias/[id]/doc?docId=...  — remove um documento da auditoria.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { secaoPorCategoria } from "@/lib/auditoria-secoes";

export const runtime = "nodejs";

const BLOB_OK = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i;

const schema = z.object({
  tipo: z.enum(["SOLICITACAO", "EVIDENCIA"]).default("EVIDENCIA"),
  secao: z.string().max(120).optional().nullable(),
  requisito: z.string().max(60).optional().nullable(),
  nome: z.string().min(1).max(300),
  // origem A: upload pro Blob
  arquivoUrl: z.string().url().optional().nullable(),
  arquivoTipo: z.string().max(120).optional().nullable(),
  arquivoTamanho: z.number().int().nonnegative().optional().nullable(),
  // origem B: vínculo a um documento da Qualidade existente
  documentoId: z.string().optional().nullable(),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  // Aceita um único documento OU um lote { itens: [...] } (importar vários de uma vez).
  let raw;
  try { raw = await req.json(); } catch { return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 }); }
  const lista = Array.isArray(raw?.itens) ? raw.itens : [raw];
  let itens;
  try {
    itens = lista.map((x) => schema.parse(x));
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  if (!itens.length) return NextResponse.json({ success: false, error: "Nada para anexar." }, { status: 400 });
  for (const it of itens) {
    if (it.arquivoUrl && !BLOB_OK.test(it.arquivoUrl)) {
      return NextResponse.json({ success: false, error: "Arquivo inválido (origem não permitida)." }, { status: 400 });
    }
    if (!it.arquivoUrl && !it.documentoId) {
      return NextResponse.json({ success: false, error: "Cada item precisa de um arquivo ou documento vinculado." }, { status: 400 });
    }
  }

  const aud = await prisma.auditoria.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!aud) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });

  // Resolve em lote os vínculos a documentos da Qualidade (copia a referência do arquivo).
  const docIds = [...new Set(itens.map((i) => i.documentoId).filter(Boolean))];
  const qmap = new Map();
  if (docIds.length) {
    const qs = await prisma.documentoQualidade.findMany({ where: { id: { in: docIds } }, select: { id: true, arquivoUrl: true, sharepointItemId: true, arquivoTipo: true, categoria: true } });
    qs.forEach((d) => qmap.set(d.id, d));
  }

  const data = itens.map((it) => {
    const q = it.documentoId ? qmap.get(it.documentoId) : null;
    // seção: a informada; senão, deriva da categoria do doc vinculado; senão "Outros".
    const secao = (it.secao && it.secao.trim()) || (q ? secaoPorCategoria(q.categoria) : "Outros");
    return {
      auditoriaId: params.id,
      tipo: it.tipo,
      secao: it.tipo === "EVIDENCIA" ? secao : null,
      requisito: it.tipo === "EVIDENCIA" ? (it.requisito || null) : null,
      nome: it.nome.slice(0, 300),
      arquivoUrl: q ? (q.arquivoUrl || null) : (it.arquivoUrl || null),
      arquivoTipo: q ? (q.arquivoTipo || null) : (it.arquivoTipo || null),
      arquivoTamanho: it.arquivoTamanho ?? null,
      sharepointItemId: q ? (q.sharepointItemId || null) : null,
      documentoId: it.documentoId || null,
    };
  });

  const res = await prisma.auditoriaDoc.createMany({ data });
  await prisma.auditLog.create({ data: { userId: user.id, action: "ANEXAR_DOC_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: { qtd: res.count } } }).catch(() => {});
  return NextResponse.json({ success: true, criados: res.count });
}

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const docId = new URL(req.url).searchParams.get("docId");
  if (!docId) return NextResponse.json({ success: false, error: "docId obrigatório" }, { status: 400 });
  await prisma.auditoriaDoc.deleteMany({ where: { id: docId, auditoriaId: params.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "REMOVER_DOC_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: { docId } } }).catch(() => {});
  return NextResponse.json({ success: true });
}

// PATCH /api/qualidade/auditorias/[id]/doc  { docId, secao } — move o documento de seção.
export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  let body;
  try {
    body = z.object({ docId: z.string().min(1), secao: z.string().max(120).nullable().optional(), requisito: z.string().max(60).nullable().optional() }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  const data = {};
  if (body.secao !== undefined) data.secao = body.secao?.trim() || "Outros";
  if (body.requisito !== undefined) data.requisito = body.requisito || null;
  await prisma.auditoriaDoc.updateMany({ where: { id: body.docId, auditoriaId: params.id }, data });
  return NextResponse.json({ success: true });
}
