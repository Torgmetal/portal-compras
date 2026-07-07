// Upload generico de arquivos pro Vercel Blob.
// Usado por anexos de RM (desenhos, especificacoes, etc).
//
// IMPORTANTE: requer BLOB_READ_WRITE_TOKEN configurado no Vercel
// (Settings > Storage > Blob > criar/conectar store). Se faltar a env var,
// vai retornar erro claro pro usuario.
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 30;

// Limite: 50MB por arquivo. Vercel Blob aceita ate 500MB.
// DWG/DXF de projetos estruturais podem passar de 20MB.
const MAX_SIZE = 50 * 1024 * 1024;

// NÃO fazemos allowlist de tipo: o cliente manda CAD dos mais variados
// (IGS/IGES, STEP, SAT, Parasolid, nativos de CAD, etc.) e o portal só precisa
// LISTAR os arquivos anexados. A única checagem é um bloqueio mínimo de
// extensões que executam script no navegador — o blob é servido num URL
// PÚBLICO, então HTML/SVG/scripts abririam brecha de XSS.
const EXTENSOES_BLOQUEADAS = new Set([
  "html", "htm", "xhtml", "shtml", "svg", "svgz", "xml", "xsl", "xslt",
  "js", "mjs", "jse", "vbs", "wsf", "hta", "phtml", "php", "php3", "php4", "php5",
]);

export async function POST(req) {
  let user;
  try {
    user = await requireUser();
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

  // Sem checagem de tipo — só listamos os arquivos do cliente. Bloqueio mínimo
  // apenas de extensões que executam script no navegador (o blob é público).
  const nomeOriginal = String(file.name || "");
  const extensao = nomeOriginal.split(".").pop()?.toLowerCase() || "";
  if (EXTENSOES_BLOQUEADAS.has(extensao)) {
    return NextResponse.json(
      { error: `Por segurança, arquivos .${extensao} não podem ser anexados (executam script no navegador). Se precisar enviar, compacte num .zip e suba o zip.` },
      { status: 400 }
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

    // Registro de auditoria
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "UPLOAD_ARQUIVO",
        entity: "Blob",
        entityId: blob.url,
        diff: { nome: file.name, tipo: file.type, tamanho: file.size },
      },
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
