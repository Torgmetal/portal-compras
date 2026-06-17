// GET    /api/qualidade/auditorias/[id]  — detalhe (com documentos)
// PATCH  /api/qualidade/auditorias/[id]  — edita cabeçalho/solicitações/boas-vindas
// DELETE /api/qualidade/auditorias/[id]  — exclui (cascade nos documentos)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const a = await prisma.auditoria.findUnique({
    where: { id: params.id },
    include: { documentos: { orderBy: { createdAt: "asc" } } },
  });
  if (!a) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });
  return NextResponse.json({ success: true, data: a });
}

const BLOB_OK = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i;

const schema = z.object({
  empresa: z.string().min(2).max(160).optional(),
  contato: z.string().max(160).nullable().optional(),
  titulo: z.string().max(160).nullable().optional(),
  mensagemBoasVindas: z.string().max(2000).nullable().optional(),
  capaUrl: z.string().url().nullable().optional(),
  checklistJson: z.any().optional(),
  solicitacoes: z.string().max(8000).nullable().optional(),
});

export async function PATCH(req, { params }) {
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
  if (body.capaUrl && !BLOB_OK.test(body.capaUrl)) {
    return NextResponse.json({ success: false, error: "Imagem de capa inválida (origem não permitida)." }, { status: 400 });
  }
  const data = {};
  for (const k of ["empresa", "contato", "titulo", "mensagemBoasVindas", "capaUrl", "solicitacoes"]) {
    if (body[k] !== undefined) data[k] = typeof body[k] === "string" ? (body[k].trim() || null) : body[k];
  }
  if (body.checklistJson !== undefined) data.checklistJson = body.checklistJson;
  const a = await prisma.auditoria.update({ where: { id: params.id }, data, include: { documentos: { orderBy: { createdAt: "asc" } } } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "EDITAR_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: body } }).catch(() => {});
  return NextResponse.json({ success: true, data: a });
}

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  await prisma.auditoria.delete({ where: { id: params.id } }).catch(() => {});
  await prisma.auditLog.create({ data: { userId: user.id, action: "EXCLUIR_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: {} } }).catch(() => {});
  return NextResponse.json({ success: true });
}
