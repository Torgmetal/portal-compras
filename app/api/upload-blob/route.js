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

// Extensoes permitidas por categoria
const EXTENSOES_PERMITIDAS = [
  // Documentos
  "pdf", "xlsx", "xls", "csv", "doc", "docx", "txt",
  // Imagens (sem SVG — pode conter <script> e o blob é servido publicamente)
  "png", "jpg", "jpeg", "gif", "webp",
  // CAD
  "dwg", "dxf", "step", "stp", "iges", "igs",
  // Compactados
  "zip", "rar", "7z",
];

// MIME types permitidos (CAD frequentemente vem como octet-stream, tratado a parte)
const MIME_TYPES_PERMITIDOS = new Set([
  // Documentos
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  // Imagens
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  // CAD (quando o browser identifica corretamente)
  "application/acad",
  "application/x-acad",
  "application/x-autocad",
  "image/vnd.dxf",
  "model/step",
  "model/iges",
  // Compactados
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
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

  // Validacao de tipo de arquivo
  const nomeOriginal = String(file.name || "");
  const extensao = nomeOriginal.split(".").pop()?.toLowerCase() || "";
  const mimeType = (file.type || "application/octet-stream").toLowerCase();

  const extensaoPermitida = EXTENSOES_PERMITIDAS.includes(extensao);
  const mimePermitido = MIME_TYPES_PERMITIDOS.has(mimeType);
  // CAD files frequentemente chegam como octet-stream — aceitar se a extensao bater
  const fallbackOctetStream =
    mimeType === "application/octet-stream" && extensaoPermitida;
  // CAD e compactados: o browser inventa o MIME (model/iges, application/iges,
  // application/step, application/x-step, etc.). Pra essas extensoes a EXTENSAO
  // manda — nenhuma delas é executável/servível como script, então é seguro.
  const EXTENSOES_POR_EXTENSAO = ["dwg", "dxf", "step", "stp", "iges", "igs", "zip", "rar", "7z"];
  const fallbackPorExtensao = extensaoPermitida && EXTENSOES_POR_EXTENSAO.includes(extensao);

  if (!extensaoPermitida || (!mimePermitido && !fallbackOctetStream && !fallbackPorExtensao)) {
    return NextResponse.json(
      {
        error:
          `Tipo de arquivo nao permitido (.${extensao}, ${mimeType}). ` +
          `Extensoes aceitas: ${EXTENSOES_PERMITIDAS.join(", ")}.`,
      },
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
