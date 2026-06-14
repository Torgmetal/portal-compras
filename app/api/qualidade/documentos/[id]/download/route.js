// GET /api/qualidade/documentos/[id]/download[?inline=1]
// Proxy autenticado (só ADMIN/QUALIDADE): busca o arquivo do Blob server-side e
// faz stream — o link do Blob nunca é exposto. inline=1 abre no navegador.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { assertBlobUrlSegura } from "@/lib/blob-url";
import { fetchRhItemResponse } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const doc = await prisma.documentoQualidade.findUnique({
    where: { id: params.id },
    select: { arquivoUrl: true, arquivoNome: true, arquivoTipo: true, sharepointItemId: true },
  });
  if (!doc?.arquivoUrl && !doc?.sharepointItemId) {
    return NextResponse.json({ error: "Documento sem arquivo" }, { status: 404 });
  }

  let res;
  if (doc.arquivoUrl) {
    try { assertBlobUrlSegura(doc.arquivoUrl); }
    catch { return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 }); }
    res = await fetch(doc.arquivoUrl);
  } else {
    res = await fetchRhItemResponse(doc.sharepointItemId); // genérico: baixa item por id no drive padrão
  }
  if (!res.ok || !res.body) return NextResponse.json({ error: "Falha ao buscar arquivo" }, { status: 502 });

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const nome = (doc.arquivoNome || "documento").replace(/["\r\n]/g, "");
  const headers = new Headers();
  headers.set("Content-Type", doc.arquivoTipo || res.headers.get("content-type") || "application/octet-stream");
  headers.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${nome}"`);
  const len = res.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, no-store");
  return new Response(res.body, { status: 200, headers });
}
