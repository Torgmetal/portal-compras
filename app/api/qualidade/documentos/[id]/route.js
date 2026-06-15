// PATCH  /api/qualidade/documentos/[id]  — edita (re-backup se trocar arquivo)
// DELETE /api/qualidade/documentos/[id]  — soft delete (ativo=false)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";
import { backupISODocumentoQualidade, moverDocumentoParaObsoleto } from "@/lib/qualidade-doc-backup";
import { calcStatusValidade, diasAlertaCategoria } from "@/lib/qualidade-status";

export const runtime = "nodejs";

const CATEGORIAS = ["MATERIAL", "EQUIPAMENTOS", "FUNCIONARIOS", "SISTEMA", "TERCEIROS"];

const schema = z.object({
  nome: z.string().min(2).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  tipo: z.string().nullable().optional(),
  norma: z.string().nullable().optional(),
  vinculo: z.string().nullable().optional(),
  opNumero: z.string().nullable().optional(),
  numeroCorrida: z.string().nullable().optional(),
  numeroDocumento: z.string().nullable().optional(),
  dataEmissao: z.string().nullable().optional(),
  dataValidade: z.string().nullable().optional(),
  responsavel: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  arquivoUrl: z.string().nullable().optional(),
  arquivoNome: z.string().nullable().optional(),
  arquivoTamanho: z.number().int().nullable().optional(),
  arquivoTipo: z.string().nullable().optional(),
});

const naoVazio = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const atual = await prisma.documentoQualidade.findUnique({ where: { id: params.id } });
  if (!atual || !atual.ativo) {
    return NextResponse.json({ success: false, error: "Documento não encontrado" }, { status: 404 });
  }

  if (body.arquivoUrl && !isBlobUrlSegura(body.arquivoUrl)) {
    return NextResponse.json({ success: false, error: "URL de arquivo inválida" }, { status: 400 });
  }

  const trocouArquivo = body.arquivoUrl !== undefined && body.arquivoUrl !== atual.arquivoUrl;

  const data = {};
  if (body.nome !== undefined) data.nome = body.nome.trim();
  if (body.categoria !== undefined) data.categoria = body.categoria;
  if (body.tipo !== undefined) data.tipo = naoVazio(body.tipo);
  if (body.norma !== undefined) data.norma = naoVazio(body.norma);
  if (body.vinculo !== undefined) data.vinculo = naoVazio(body.vinculo);
  if (body.opNumero !== undefined) data.opNumero = naoVazio(body.opNumero);
  if (body.numeroCorrida !== undefined) data.numeroCorrida = naoVazio(body.numeroCorrida);
  if (body.numeroDocumento !== undefined) data.numeroDocumento = naoVazio(body.numeroDocumento);
  if (body.dataEmissao !== undefined) data.dataEmissao = body.dataEmissao ? new Date(body.dataEmissao) : null;
  if (body.dataValidade !== undefined) data.dataValidade = body.dataValidade ? new Date(body.dataValidade) : null;
  if (body.responsavel !== undefined) data.responsavel = naoVazio(body.responsavel);
  if (body.observacao !== undefined) data.observacao = naoVazio(body.observacao);
  if (body.arquivoUrl !== undefined) data.arquivoUrl = body.arquivoUrl || null;
  if (body.arquivoNome !== undefined) data.arquivoNome = naoVazio(body.arquivoNome);
  if (body.arquivoTamanho !== undefined) data.arquivoTamanho = body.arquivoTamanho ?? null;
  if (body.arquivoTipo !== undefined) data.arquivoTipo = naoVazio(body.arquivoTipo);
  // Se trocou o arquivo, a cópia antiga do SharePoint não vale mais
  if (trocouArquivo) data.sharepointUrl = null;

  const doc = await prisma.documentoQualidade.update({ where: { id: params.id }, data });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "EDITAR_DOC_QUALIDADE", entity: "DocumentoQualidade", entityId: doc.id, diff: { antes: { nome: atual.nome }, depois: body } } })
    .catch(() => {});

  let backup = null;
  if (trocouArquivo && doc.arquivoUrl) backup = await backupISODocumentoQualidade(doc, user.id);

  return NextResponse.json({ success: true, backup });
}

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const atual = await prisma.documentoQualidade.findUnique({ where: { id: params.id } });
  if (!atual) return NextResponse.json({ success: false, error: "Documento não encontrado" }, { status: 404 });

  const motivo = new URL(req.url).searchParams.get("motivo");

  // Se o documento estiver VENCIDO e tiver arquivo no SharePoint, move para a
  // pasta de Obsoletos (em vez de só deixar no lugar). Best-effort.
  const status = calcStatusValidade(atual.dataValidade, diasAlertaCategoria(atual.categoria)).key;
  let obsoleto = null;
  if (status === "VENCIDO" && atual.sharepointItemId) {
    obsoleto = await moverDocumentoParaObsoleto(atual, user.id);
  }

  await prisma.documentoQualidade.update({
    where: { id: params.id },
    data: { ativo: false, invalidadoMotivo: motivo || null },
  });
  await prisma.auditLog
    .create({ data: { userId: user.id, action: "EXCLUIR_DOC_QUALIDADE", entity: "DocumentoQualidade", entityId: params.id, diff: { nome: atual.nome, motivo: motivo || null, vencido: status === "VENCIDO", obsoleto: obsoleto?.ok || false } } })
    .catch(() => {});

  return NextResponse.json({ success: true, obsoleto });
}
