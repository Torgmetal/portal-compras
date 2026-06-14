// POST /api/qualidade/documentos/upload-token
// Gera o token de upload DIRETO pro Vercel Blob (client upload), para arquivos
// grandes (>4,5MB) não passarem pela função serverless. Só ADMIN/QUALIDADE.
// O arquivo sobe com sufixo aleatório (URL não-adivinhável); o acesso é sempre
// pelo proxy autenticado /api/qualidade/documentos/[id]/download.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

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
        await requireRole(["ADMIN", "QUALIDADE"]);
        return {
          allowedContentTypes: TIPOS_PERMITIDOS,
          addRandomSuffix: true,
          maximumSizeInBytes: 50 * 1024 * 1024,
          tokenPayload: null,
        };
      },
      // backup ISO é disparado no POST/PATCH (cliente), não no webhook.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
}
