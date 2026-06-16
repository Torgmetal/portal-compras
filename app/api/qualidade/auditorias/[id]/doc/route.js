// POST   /api/qualidade/auditorias/[id]/doc   — anexa um documento (upload Blob OU vínculo
//        a um DocumentoQualidade existente). tipo: SOLICITACAO (pedido do cliente) | EVIDENCIA.
// DELETE /api/qualidade/auditorias/[id]/doc?docId=...  — remove um documento da auditoria.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const BLOB_OK = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i;

const schema = z.object({
  tipo: z.enum(["SOLICITACAO", "EVIDENCIA"]).default("EVIDENCIA"),
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
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  if (body.arquivoUrl && !BLOB_OK.test(body.arquivoUrl)) {
    return NextResponse.json({ success: false, error: "Arquivo inválido (origem não permitida)." }, { status: 400 });
  }
  if (!body.arquivoUrl && !body.documentoId) {
    return NextResponse.json({ success: false, error: "Anexe um arquivo ou vincule um documento existente." }, { status: 400 });
  }

  const aud = await prisma.auditoria.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!aud) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });

  // Vínculo a documento da Qualidade: copia a referência do arquivo (Blob ou SharePoint).
  let sharepointItemId = null, arquivoUrl = body.arquivoUrl || null, arquivoTipo = body.arquivoTipo || null;
  if (body.documentoId) {
    const d = await prisma.documentoQualidade.findUnique({ where: { id: body.documentoId }, select: { arquivoUrl: true, sharepointItemId: true, arquivoTipo: true } });
    if (!d) return NextResponse.json({ success: false, error: "Documento da Qualidade não encontrado" }, { status: 404 });
    arquivoUrl = d.arquivoUrl || null;
    sharepointItemId = d.sharepointItemId || null;
    arquivoTipo = d.arquivoTipo || null;
  }

  const doc = await prisma.auditoriaDoc.create({
    data: {
      auditoriaId: params.id,
      tipo: body.tipo,
      nome: body.nome.slice(0, 300),
      arquivoUrl,
      arquivoTipo,
      arquivoTamanho: body.arquivoTamanho ?? null,
      sharepointItemId,
      documentoId: body.documentoId || null,
    },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "ANEXAR_DOC_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: { tipo: body.tipo, nome: body.nome } } }).catch(() => {});
  return NextResponse.json({ success: true, doc });
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
