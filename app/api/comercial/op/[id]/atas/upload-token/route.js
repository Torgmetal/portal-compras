// POST /api/comercial/op/[id]/atas/upload-token
// Token de upload DIRETO pro Vercel Blob (client upload) pros anexos das atas da
// OP — o arquivo vai do navegador pro Blob sem passar pela função serverless,
// fugindo do teto de ~4,5MB (ver [[torg_upload_4mb]]). PDF, Word, Excel, imagem.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const TIPOS = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png", "image/jpeg", "image/webp",
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
        await requireRole(["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"]);
        return { allowedContentTypes: TIPOS, addRandomSuffix: true, maximumSizeInBytes: 50 * 1024 * 1024, tokenPayload: null };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
}
