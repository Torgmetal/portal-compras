import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

// Biblioteca fixa de documentos institucionais da Torg (cadastrais, portfólio…),
// reutilizada em toda apresentação ao cliente.
export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const incluirInativos = new URL(req.url).searchParams.get("todos") === "1";
    const docs = await prisma.documentoInstitucional.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: [{ tipo: "asc" }, { ordem: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ success: true, docs });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

const schema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["CADASTRAL", "PORTFOLIO", "OUTRO"]).default("CADASTRAL"),
  arquivoUrl: z.string().url(),
  arquivoTipo: z.string().nullable().optional(),
  arquivoTamanho: z.number().int().nullable().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 });
  }
  const doc = await prisma.documentoInstitucional.create({
    data: { ...body, arquivoTipo: body.arquivoTipo || null, arquivoTamanho: body.arquivoTamanho || null, criadoPorId: user.id },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "CRIAR_DOC_INSTITUCIONAL", entity: "DocumentoInstitucional", entityId: doc.id, diff: { nome: doc.nome, tipo: doc.tipo } } });
  return NextResponse.json({ success: true, doc }, { status: 201 });
}
