// POST — importa (ou reimporta) os procedimentos do SGQ para o Controle de Documentos.
// GET  — lista os que já estão importados.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { importarProcedimentos } from "@/lib/importar-procedimentos";

export const runtime = "nodejs";
export const maxDuration = 120;

const PERFIS = ["ADMIN", "QUALIDADE"];

export async function GET() {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const docs = await prisma.documentoQualidade.findMany({
    where: { categoria: "SISTEMA", tipo: "Procedimento Operacional", ativo: true },
    select: { id: true, nome: true, numeroDocumento: true, observacao: true, updatedAt: true },
    orderBy: { numeroDocumento: "asc" },
  });
  return NextResponse.json({ procedimentos: docs });
}

export async function POST() {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const r = await importarProcedimentos({ userId: user.id });
  if (r.erro) return NextResponse.json({ error: r.erro }, { status: 502 });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "IMPORTAR_PROCEDIMENTOS_SGQ", entity: "DocumentoQualidade", entityId: "-", diff: r },
  }).catch(() => {});
  return NextResponse.json({ ok: true, ...r });
}
