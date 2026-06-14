// POST /api/qualidade/documentos/[id]/validar  { validado: boolean }
// Marca/desmarca a informação do documento como validada (camada de revisão).
// Só ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({ validado: z.boolean() });

export async function POST(req, { params }) {
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

  const doc = await prisma.documentoQualidade.update({
    where: { id: params.id },
    data: {
      validado: body.validado,
      validadoPorId: body.validado ? user.id : null,
      validadoEm: body.validado ? new Date() : null,
    },
  });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: body.validado ? "VALIDAR_DOC_QUALIDADE" : "INVALIDAR_VALIDACAO_DOC_QUALIDADE", entity: "DocumentoQualidade", entityId: doc.id, diff: { validado: body.validado } } })
    .catch(() => {});

  return NextResponse.json({ success: true, validado: doc.validado, validadoEm: doc.validadoEm });
}
