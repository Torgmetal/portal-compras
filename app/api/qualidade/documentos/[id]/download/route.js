// GET /api/qualidade/documentos/[id]/download[?inline=1]
// Proxy autenticado (só ADMIN/QUALIDADE): busca o arquivo do Blob server-side e
// faz stream — o link do Blob nunca é exposto. inline=1 abre no navegador.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";
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

  // ⚠⚠ `arquivoUrl` NEM SEMPRE É BLOB — E O CAMINHO FALHAVA ANTES DE TENTAR O SHAREPOINT.
  // Vitor (23/08/2026): "os arquivos não estão sendo possíveis de baixar nem visualizar".
  //
  // O certificado importado da planilha de rastreabilidade guarda em `arquivoUrl` a URL WEB do
  // SharePoint (…/SERVIDOR/Almoxarifado/01. Rastreabilidade/Certificados 2025/R 251768 a 775.pdf),
  // não uma URL do Blob. O código validava com `assertBlobUrlSegura`, que lança, e o `catch`
  // devolvia 400 "Arquivo inválido" — SEM NUNCA CHEGAR no ramo do SharePoint, mesmo com o
  // `sharepointItemId` gravado ao lado. Medido: 2.790 dos 3.177 documentos com `arquivoUrl` são
  // do SharePoint, e TODOS os 2.790 têm o itemId. Nenhum deles baixava.
  //
  // ⚠ a defesa de SSRF continua inteira: URL que não é do Blob não é buscada por URL nenhuma — vai
  // pelo item do SharePoint, que é id opaco no drive da empresa. O que muda é que agora ela cai
  // para o SharePoint em vez de morrer em 400.
  let res;
  if (isBlobUrlSegura(doc.arquivoUrl)) {
    res = await fetch(doc.arquivoUrl);
  } else if (doc.sharepointItemId) {
    res = await fetchRhItemResponse(doc.sharepointItemId); // genérico: baixa item por id no drive padrão
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
