// POST   /api/qualidade/data-books/[id]/aprovar  — registra a aprovação do usuário logado
// DELETE /api/qualidade/data-books/[id]/aprovar  — remove a própria aprovação
// Aprovação interna (inspetor + envolvidos) antes de enviar o data book ao cliente.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let papel = null;
  try { papel = z.object({ papel: z.string().max(40).nullable().optional() }).parse(await req.json()).papel || null; } catch { /* body opcional */ }

  const book = await prisma.dataBookQualidade.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!book) return NextResponse.json({ success: false, error: "Data book não encontrado" }, { status: 404 });

  await prisma.dataBookAprovacao.upsert({
    where: { dataBookId_userId: { dataBookId: params.id, userId: user.id } },
    update: { aprovadoEm: new Date(), papel },
    create: { dataBookId: params.id, userId: user.id, nome: user.name || user.email || "Usuário", papel },
  });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "APROVAR_DATABOOK_QUALIDADE", entity: "DataBookQualidade", entityId: params.id, diff: { papel } } })
    .catch(() => {});

  const aprovacoes = await prisma.dataBookAprovacao.findMany({ where: { dataBookId: params.id }, orderBy: { aprovadoEm: "asc" } });
  return NextResponse.json({ success: true, aprovacoes });
}

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  await prisma.dataBookAprovacao.deleteMany({ where: { dataBookId: params.id, userId: user.id } });
  const aprovacoes = await prisma.dataBookAprovacao.findMany({ where: { dataBookId: params.id }, orderBy: { aprovadoEm: "asc" } });
  return NextResponse.json({ success: true, aprovacoes });
}
