// POST   /api/qualidade/data-books/secao/[secaoId]/doc  { documentoId }  — vincula
// DELETE /api/qualidade/data-books/secao/[secaoId]/doc?documentoId=...    — desvincula
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({ documentoId: z.string().min(1) });

export async function POST(req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const secao = await prisma.dataBookSecao.findUnique({ where: { id: params.secaoId }, select: { id: true } });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });

  const doc = await prisma.documentoQualidade.findUnique({ where: { id: body.documentoId }, select: { id: true, ativo: true } });
  if (!doc || !doc.ativo) return NextResponse.json({ success: false, error: "Documento não encontrado" }, { status: 404 });

  await prisma.dataBookSecaoDoc.upsert({
    where: { secaoId_documentoId: { secaoId: params.secaoId, documentoId: body.documentoId } },
    create: { secaoId: params.secaoId, documentoId: body.documentoId },
    update: {},
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const documentoId = new URL(req.url).searchParams.get("documentoId");
  if (!documentoId) return NextResponse.json({ success: false, error: "documentoId obrigatório" }, { status: 400 });

  await prisma.dataBookSecaoDoc
    .delete({ where: { secaoId_documentoId: { secaoId: params.secaoId, documentoId } } })
    .catch(() => {});

  return NextResponse.json({ success: true });
}
