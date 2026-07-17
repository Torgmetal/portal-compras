// POST /api/comercial/apresentacoes/upload-token
// Token de upload DIRETO pro Vercel Blob (client upload): o arquivo vai do
// navegador pro Blob sem passar pela função serverless — foge do teto de 4,5MB
// do corpo da requisição, que fazia documentos grandes (portfólio, catálogos)
// falharem. Só ADMIN/COMERCIAL. Espelha /api/rh/documentos/upload-token.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

// Allowlist de documentos de apresentação (PDF, Office, imagens, zip). NÃO
// inclui svg/html/xml — o blob é público e esses executam script no navegador.
// octet-stream (tipo desconhecido) é aceito: o navegador BAIXA, não renderiza.
const TIPOS = [
  "application/pdf",
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed",
  "text/plain", "text/csv",
  "application/octet-stream",
];

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  try {
    const json = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async () => {
        await requireRole(["ADMIN", "COMERCIAL"]);
        return {
          allowedContentTypes: TIPOS,
          addRandomSuffix: true,
          maximumSizeInBytes: 50 * 1024 * 1024,
          tokenPayload: null,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
}
