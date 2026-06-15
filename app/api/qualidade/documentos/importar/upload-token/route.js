// POST /api/qualidade/documentos/importar/upload-token
// Token de upload DIRETO pro Vercel Blob (client upload) para a planilha CMR —
// arquivos grandes (~17MB) não cabem no body de uma função serverless, então o
// navegador sobe direto pro Blob e a importação lê de lá. Só ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const TIPOS = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.ms-excel", // xls
  "text/csv",
  "application/octet-stream", // alguns navegadores mandam xlsx assim
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
        return { allowedContentTypes: TIPOS, addRandomSuffix: true, maximumSizeInBytes: 30 * 1024 * 1024 };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
}
