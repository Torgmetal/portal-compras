// Vincula um anexo (ja uploaded via /api/upload-blob) a uma RM existente.
// Recebe os metadados retornados pelo upload-blob.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  url: z.string().url(),
  nomeArquivo: z.string().min(1),
  tamanho: z.number().int().min(0),
  tipo: z.string().default("application/octet-stream"),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS", "ENGENHARIA", "COMERCIAL", "REQUISICOES"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  const rm = await prisma.rM.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!rm) return NextResponse.json({ error: "RM nao encontrada." }, { status: 404 });

  const anexo = await prisma.anexo.create({
    data: {
      rmId: rm.id,
      nomeArquivo: body.nomeArquivo,
      blobUrl: body.url,
      tamanho: body.tamanho,
      tipo: body.tipo,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "add_anexo_rm",
      entity: "RM",
      entityId: rm.id,
      diff: { nomeArquivo: body.nomeArquivo, tamanho: body.tamanho },
    },
  });

  return NextResponse.json({
    id: anexo.id,
    nomeArquivo: anexo.nomeArquivo,
    blobUrl: anexo.blobUrl,
    tamanho: anexo.tamanho,
    tipo: anexo.tipo,
    uploadedAt: anexo.uploadedAt,
  });
}
