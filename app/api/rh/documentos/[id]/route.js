// PATCH/DELETE /api/rh/documentos/[id]
// PATCH: anexar/trocar o arquivo de um documento existente (+ backup ISO) e/ou
// editar metadados. DELETE: desativa (soft delete) preservando a evidência ISO.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";
import { backupISODocumento } from "@/lib/rh-doc-backup";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60; // o backup baixa do Blob e sobe pro SharePoint

const patchSchema = z.object({
  nome: z.string().min(2).optional(),
  tipo: z.string().min(1).optional(),
  descricao: z.string().optional().nullable(),
  dataEmissao: z.string().optional().nullable(),
  dataValidade: z.string().optional().nullable(),
  orgaoEmissor: z.string().optional().nullable(),
  numeroDocumento: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
  arquivoUrl: z.string().url().optional().nullable(),
  arquivoNome: z.string().optional().nullable(),
  arquivoTamanho: z.number().int().optional().nullable(),
  arquivoTipo: z.string().optional().nullable(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const existente = await prisma.documento.findUnique({ where: { id: params.id } });
  if (!existente) return NextResponse.json({ success: false, error: "Documento não encontrado" }, { status: 404 });

  const p = parsed.data;
  if (p.arquivoUrl && !isBlobUrlSegura(p.arquivoUrl)) {
    return NextResponse.json({ success: false, error: "URL de arquivo inválida." }, { status: 400 });
  }

  const trocouArquivo = p.arquivoUrl && p.arquivoUrl !== existente.arquivoUrl;

  const data = {};
  for (const k of ["nome", "tipo", "descricao", "orgaoEmissor", "numeroDocumento", "observacao", "arquivoUrl", "arquivoNome", "arquivoTamanho", "arquivoTipo"]) {
    if (p[k] !== undefined) data[k] = p[k];
  }
  if (p.dataEmissao !== undefined) data.dataEmissao = p.dataEmissao ? new Date(p.dataEmissao) : null;
  if (p.dataValidade !== undefined) data.dataValidade = p.dataValidade ? new Date(p.dataValidade) : null;
  if (trocouArquivo) data.sharepointUrl = null; // backup novo será gerado abaixo

  const doc = await prisma.documento.update({ where: { id: params.id }, data });

  await prisma.auditLog.create({
    data: { userId: user.id, action: trocouArquivo ? "ANEXAR_ARQUIVO_DOC" : "ATUALIZAR_DOCUMENTO", entity: "Documento", entityId: doc.id, diff: { campos: Object.keys(data) } },
  }).catch(() => {});

  // Backup ISO no SharePoint só quando trocou/anexou arquivo.
  let backup = null;
  if (trocouArquivo) backup = await backupISODocumento(doc, user.id);

  const { arquivoUrl, ...docSemUrl } = doc;
  return NextResponse.json({ success: true, data: { ...docSemUrl, temArquivo: !!arquivoUrl, sharepointUrl: backup?.sharepointUrl || doc.sharepointUrl }, backup });
}

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const doc = await prisma.documento.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ success: false, error: "Documento não encontrado" }, { status: 404 });

  // Soft delete — preserva a evidência (a cópia no SharePoint permanece para ISO).
  await prisma.documento.update({ where: { id: params.id }, data: { ativo: false } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "DESATIVAR_DOCUMENTO", entity: "Documento", entityId: doc.id, diff: { nome: doc.nome } },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
