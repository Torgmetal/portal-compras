// GET  /api/qualidade/auditorias  — lista auditorias externas
// POST /api/qualidade/auditorias  — cria uma auditoria
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const auditorias = await prisma.auditoria.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { documentos: true } } },
  });
  return NextResponse.json({ success: true, data: auditorias });
}

const schema = z.object({
  empresa: z.string().min(2, "Informe a empresa do cliente").max(160),
  contato: z.string().max(160).optional().nullable(),
  titulo: z.string().max(160).optional().nullable(),
  mensagemBoasVindas: z.string().max(2000).optional().nullable(),
  solicitacoes: z.string().max(8000).optional().nullable(),
});

export async function POST(req) {
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
  const a = await prisma.auditoria.create({
    data: {
      empresa: body.empresa.trim(),
      contato: body.contato?.trim() || null,
      titulo: body.titulo?.trim() || null,
      mensagemBoasVindas: body.mensagemBoasVindas?.trim() || null,
      solicitacoes: body.solicitacoes?.trim() || null,
      criadoPorId: user.id,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "CRIAR_AUDITORIA", entity: "Auditoria", entityId: a.id, diff: { empresa: body.empresa } } }).catch(() => {});
  return NextResponse.json({ success: true, id: a.id }, { status: 201 });
}
