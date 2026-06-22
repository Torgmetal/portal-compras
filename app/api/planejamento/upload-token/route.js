// POST /api/planejamento/upload-token — token de upload direto ao Vercel Blob
// (client upload) para a ata/arquivo de reunião lido pela IA. Só ADMIN/PLANEJAMENTO.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const TIPOS_PERMITIDOS = ["application/pdf", "text/plain", "text/csv"];

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  try {
    const json = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async () => {
        await requireRole(["ADMIN", "PLANEJAMENTO"]);
        return {
          allowedContentTypes: TIPOS_PERMITIDOS,
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024,
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
