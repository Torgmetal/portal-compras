// GET /api/rh/documentos/[id]/download[?inline=1]
// Proxy autenticado: só ADMIN/RH; busca o arquivo do Blob server-side e faz
// stream (o link público do Blob nunca é exposto ao cliente). inline=1 abre no
// navegador (PDF/imagem); senão baixa.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";
import { fetchRhItemResponse } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const doc = await prisma.documento.findUnique({
    where: { id: params.id },
    select: { arquivoUrl: true, arquivoNome: true, arquivoTipo: true, sharepointItemId: true },
  });
  if (!doc?.arquivoUrl && !doc?.sharepointItemId) {
    return NextResponse.json({ error: "Documento sem arquivo" }, { status: 404 });
  }

  // Documentos importados são servidos direto do SharePoint (sem cópia no Blob).
  // ⚠ MESMO FURO DA QUALIDADE (23/08/2026): `arquivoUrl` nem sempre é Blob — documento importado
  // guarda a URL WEB do SharePoint, e validar com `assertBlobUrlSegura` fazia a rota morrer em 400
  // ANTES de tentar o item do SharePoint que está gravado ao lado. Cai para o SharePoint em vez de
  // rejeitar; a defesa de SSRF continua inteira, porque URL que não é do Blob nunca é buscada.
  let res;
  if (isBlobUrlSegura(doc.arquivoUrl)) {
    res = await fetch(doc.arquivoUrl);
  } else if (doc.sharepointItemId) {
    res = await fetchRhItemResponse(doc.sharepointItemId);
  } else {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
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
