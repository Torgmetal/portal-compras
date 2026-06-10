import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { isBlobUrlSegura } from "@/lib/blob-url";

// ── GET /api/comercial/estudo/[id]/documentos ── Lista documentos ──

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const documentos = await prisma.propostaDocumento.findMany({
      where: { estudoId: id },
      orderBy: { criadoEm: "desc" },
    });

    return NextResponse.json({ success: true, data: documentos });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST /api/comercial/estudo/[id]/documentos ── Registrar documento após upload no Blob ──

const criarDocSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  tipo: z.string().min(1, "Tipo é obrigatório"),
  tamanho: z.number().optional(),
  blobUrl: z.string().url("URL inválida").refine(isBlobUrlSegura, "blobUrl deve ser do armazenamento Vercel Blob"),
  categoria: z.string().optional(),
  observacao: z.string().optional(),
});

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const data = criarDocSchema.parse(body);

    // Verificar se o estudo existe
    const estudo = await prisma.propostaEstudo.findUnique({ where: { id } });
    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo não encontrado" }, { status: 404 });
    }

    const documento = await prisma.propostaDocumento.create({
      data: {
        estudoId: id,
        ...data,
      },
    });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "UPLOAD_DOCUMENTO",
        entity: "PropostaDocumento",
        entityId: documento.id,
        diff: { nome: data.nome, tipo: data.tipo, categoria: data.categoria },
      },
    });

    return NextResponse.json({ success: true, data: documento }, { status: 201 });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── DELETE /api/comercial/estudo/[id]/documentos?docId=xxx ── Excluir documento ──

export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("docId");

    if (!docId) {
      return NextResponse.json({ success: false, error: "docId é obrigatório" }, { status: 400 });
    }

    const doc = await prisma.propostaDocumento.findFirst({
      where: { id: docId, estudoId: id },
    });
    if (!doc) {
      return NextResponse.json({ success: false, error: "Documento não encontrado" }, { status: 404 });
    }

    await prisma.propostaDocumento.delete({ where: { id: docId } });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_DOCUMENTO",
        entity: "PropostaDocumento",
        entityId: docId,
        diff: { nome: doc.nome },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
