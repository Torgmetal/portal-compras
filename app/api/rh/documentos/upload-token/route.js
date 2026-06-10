// POST /api/rh/documentos/upload-token
// Gera o token de upload DIRETO pro Vercel Blob (client upload), pra arquivos
// de RH grandes (>4,5MB) não passarem pela função serverless. Só ADMIN/RH.
// O arquivo sobe com sufixo aleatório (URL não-adivinhável); o acesso depois é
// sempre pelo proxy autenticado /api/rh/documentos/[id]/download.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

// Documentos de RH: PDF, imagens e Word. Nada de CAD/zip/planilha aqui.
const TIPOS_PERMITIDOS = [
  "application/pdf",
  "image/png", "image/jpeg", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async () => {
        // Só ADMIN/RH podem subir documento de RH (dado sensível/LGPD).
        await requireRole(["ADMIN", "RH"]);
        return {
          allowedContentTypes: TIPOS_PERMITIDOS,
          addRandomSuffix: true, // URL não-adivinhável
          maximumSizeInBytes: 50 * 1024 * 1024,
          tokenPayload: null,
        };
      },
      // O webhook onUploadCompleted não roda em localhost; o backup ISO no
      // SharePoint é disparado no POST/PATCH (orientado pelo cliente), não aqui.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
}
