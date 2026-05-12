// Upload generico de arquivos pro Vercel Blob.
// Usado por anexos de RM (desenhos, especificacoes, etc).
//
// IMPORTANTE: requer BLOB_READ_WRITE_TOKEN configurado no Vercel
// (Settings > Storage > Blob > criar/conectar store). Se faltar a env var,
// vai retornar erro claro pro usuario.
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

// Limite: 20MB por arquivo. Vercel Blob aceita ate 500MB mas vamos manter
// modesto pra evitar abuso.
const MAX_SIZE = 20 * 1024 * 1024;

export async function POST(req) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Storage de arquivos nao configurado. Acesse o dashboard do Vercel " +
          "(Storage > Blob) pra criar um store e ele vai injetar BLOB_READ_WRITE_TOKEN automaticamente.",
      },
      { status: 500 }
    );
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

  // Prefixa com timestamp pra evitar conflito de nome
  const stamp = Date.now();
  const safeName = String(file.name || "arquivo")
    .replace(/[^\w\d.\- ]/g, "_")
    .substring(0, 100);
  const pathname = `rm-anexos/${stamp}-${safeName}`;

  try {
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type || "application/octet-stream",
    });

    return NextResponse.json({
      url: blob.url,
      nomeArquivo: file.name,
      tamanho: file.size,
      tipo: file.type || "application/octet-stream",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Falha no upload: " + (e?.message || "erro desconhecido") },
      { status: 500 }
    );
  }
}
