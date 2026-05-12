// Upload publico de anexo pra cotacao identificada por token.
// Usado pelo portal do fornecedor — sem auth de sessao, validacao por token.
// Vincula o arquivo como Anexo da Cotacao.
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_SIZE = 20 * 1024 * 1024;

export async function POST(req, { params }) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Storage de arquivos nao configurado no servidor." },
      { status: 500 }
    );
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { token: params.token },
    select: { id: true, status: true },
  });
  if (!cotacao) return NextResponse.json({ error: "Token invalido." }, { status: 404 });
  if (cotacao.status === "CANCELADA") {
    return NextResponse.json({ error: "Cotacao cancelada." }, { status: 409 });
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Multipart/form-data esperado." }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Campo 'file' obrigatorio." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `Arquivo muito grande. Limite ${MAX_SIZE / (1024 * 1024)}MB.` },
      { status: 413 }
    );
  }

  const stamp = Date.now();
  const safeName = String(file.name || "proposta")
    .replace(/[^\w\d.\- ]/g, "_")
    .substring(0, 100);
  const pathname = `cotacao-anexos/${cotacao.id}/${stamp}-${safeName}`;

  let blob;
  try {
    blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type || "application/octet-stream",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Falha no upload: " + (e?.message || "erro desconhecido") },
      { status: 500 }
    );
  }

  const anexo = await prisma.anexo.create({
    data: {
      cotacaoId: cotacao.id,
      nomeArquivo: file.name,
      blobUrl: blob.url,
      tamanho: file.size,
      tipo: file.type || "application/octet-stream",
    },
  });

  return NextResponse.json({
    id: anexo.id,
    url: blob.url,
    nomeArquivo: file.name,
    tamanho: file.size,
    tipo: file.type || "application/octet-stream",
  });
}
