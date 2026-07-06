import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["CADASTRAL", "PORTFOLIO", "OUTRO"]).default("OUTRO"),
  arquivoUrl: z.string().url(),
  arquivoTipo: z.string().nullable().optional(),
  arquivoTamanho: z.number().int().nullable().optional(),
});

// Adiciona um documento EXTRA (específico deste cliente) à apresentação.
export async function POST(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
    const { id } = await params;
    const body = schema.parse(await req.json());
    const doc = await prisma.apresentacaoDoc.create({
      data: { apresentacaoId: id, nome: body.nome, tipo: body.tipo, arquivoUrl: body.arquivoUrl, arquivoTipo: body.arquivoTipo || null, arquivoTamanho: body.arquivoTamanho || null },
    });
    return NextResponse.json({ success: true, doc }, { status: 201 });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : e.name === "ZodError" ? 400 : 500;
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || e.message }, { status });
  }
}

export async function DELETE(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
    await params; // id da apresentação (não precisa aqui)
    const docId = new URL(req.url).searchParams.get("docId");
    if (!docId) return NextResponse.json({ success: false, error: "docId obrigatório" }, { status: 400 });
    await prisma.apresentacaoDoc.delete({ where: { id: docId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
