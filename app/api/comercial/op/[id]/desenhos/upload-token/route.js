// POST — token de upload DIRETO pro Vercel Blob (client upload) pros desenhos de
// projeto da OP (aba Engenharia). Foge do teto de ~4,5MB da função serverless
// ([[torg_upload_4mb]]). PDF e CAD (DWG/DXF). Espelha /api/rm/upload-token.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

// PDF + CAD (DWG/DXF) + imagens (scan). octet-stream cobre DWG que chega sem MIME
// e o navegador BAIXA em vez de renderizar. NÃO inclui html/svg/xml/js.
const TIPOS = [
  "application/pdf",
  "application/acad", "application/x-acad", "application/dwg", "application/x-dwg", "image/vnd.dwg", "image/x-dwg", "drawing/dwg",
  "application/dxf", "image/vnd.dxf", "application/x-dxf",
  "image/png", "image/jpeg", "image/webp", "image/tiff",
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
        await requireRole(["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"]);
        return { allowedContentTypes: TIPOS, addRandomSuffix: true, maximumSizeInBytes: 100 * 1024 * 1024, tokenPayload: null };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
}
