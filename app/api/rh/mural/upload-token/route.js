// POST /api/rh/mural/upload-token
// Token de upload DIRETO pro Vercel Blob (client upload) da imagem de um
// comunicado do mural. Só ADMIN/RH. URL pública com sufixo aleatório
// (não-adivinhável) — a imagem de comunicado é conteúdo geral (não sigiloso).
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

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
        await requireRole(["ADMIN", "RH"]);
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
          addRandomSuffix: true,
          maximumSizeInBytes: 8 * 1024 * 1024, // 8 MB
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
