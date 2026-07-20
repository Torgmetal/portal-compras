// POST /api/rm/upload-token
// Token de upload DIRETO pro Vercel Blob (client upload): o arquivo (desenho,
// especificação, ZIP de referências pra cotação, CAD) vai do navegador pro Blob
// SEM passar pela função serverless — foge do teto de ~4,5MB do corpo da
// requisição, que fazia ZIP/CAD grandes falharem no anexo da RM (o /api/upload-blob
// dizia aceitar 50MB, mas a plataforma cortava em 4,5MB). Espelha
// /api/comercial/apresentacoes/upload-token. Depois o cliente vincula o blob via
// POST /api/rm/[id]/anexos (RM existente) ou manda junto no POST /api/rm (nova).
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

// Allowlist: PDF, Office, imagens (sem SVG), ZIP, CAD e texto. octet-stream é
// aceito (CAD/tipo desconhecido — IGS/STEP/SAT/nativos) — o blob é público, mas
// octet-stream o navegador BAIXA em vez de renderizar, então não abre XSS. NÃO
// inclui html/svg/xml/js (esses renderizam/executam script no navegador).
const TIPOS = [
  "application/pdf",
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed", "application/x-compressed", "multipart/x-zip",
  "application/acad", "image/vnd.dwg", "application/dxf", "image/vnd.dxf",
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
        await requireRole(["ADMIN", "COMPRAS", "ENGENHARIA", "COMERCIAL", "REQUISICOES"]);
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
