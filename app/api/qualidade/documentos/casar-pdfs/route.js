// GET  /api/qualidade/documentos/casar-pdfs?url=...  — pré-visualização do casamento
// POST /api/qualidade/documentos/casar-pdfs  { url }  — vincula os PDFs aos documentos
//
// Casa a pasta "Certificados Digitalizados" do SharePoint com os documentos
// importados do CMR pelo ÍNDICE R (importRef). Um PDF de faixa atende vários docs.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, prismaDirect } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { mapearCertificados } from "@/lib/match-certificados";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({ url: z.string().url().optional() });

async function docsImportados() {
  return prisma.documentoQualidade.findMany({
    where: { ativo: true, origem: "importacao_planilha", importRef: { not: null } },
    select: { id: true, importRef: true, sharepointItemId: true },
  });
}

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  // sem link → usa a pasta fixa de certificados (mapearCertificados trata null)
  const url = new URL(req.url).searchParams.get("url") || process.env.SHAREPOINT_CERTS_URL || null;

  let mapa;
  try {
    mapa = await mapearCertificados(url);
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao ler do SharePoint: " + e.message }, { status: 502 });
  }

  const docs = await docsImportados();
  let casaveis = 0, jaComArquivo = 0, semPdf = 0;
  const amostraSemPdf = [];
  for (const d of docs) {
    if (d.sharepointItemId) { jaComArquivo++; continue; }
    if (mapa.porIndice.has(d.importRef)) casaveis++;
    else { semPdf++; if (amostraSemPdf.length < 10) amostraSemPdf.push(d.importRef); }
  }

  return NextResponse.json({
    success: true,
    pasta: mapa.pasta,
    totalPdfs: mapa.totalPdfs,
    totalDocs: docs.length,
    casaveis,
    jaComArquivo,
    semPdf,
    amostraSemPdf,
  });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const url = body.url || process.env.SHAREPOINT_CERTS_URL || null;

  let mapa;
  try {
    mapa = await mapearCertificados(url);
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao ler do SharePoint: " + e.message }, { status: 502 });
  }

  // Escrita em massa num ÚNICO UPDATE (UNNEST) — antes era 1 updateMany por PDF
  // (centenas de PDFs → centenas de idas ao banco → timeout/504). Ver CLAUDE.md
  // (bulk write: SQL constante + arrays-literais de texto + cast ::text[]).
  const refs = [], itemIds = [], urls = [], nomes = [];
  for (const [indice, a] of mapa.porIndice) {
    if (!a) continue;
    refs.push(indice);
    itemIds.push(a.id);
    urls.push(a.webUrl || null);
    nomes.push(a.name || null);
  }
  const pgArr = (arr) =>
    "{" + arr.map((v) => (v == null ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",") + "}";

  let casados = 0;
  if (refs.length) {
    try {
      casados = await prismaDirect.$executeRawUnsafe(
        `UPDATE "DocumentoQualidade" AS d
            SET "sharepointItemId" = v.item_id,
                "sharepointUrl"    = v.url,
                "arquivoNome"      = v.nome,
                "arquivoTipo"      = 'application/pdf'
          FROM (SELECT unnest($1::text[]) AS ref,
                       unnest($2::text[]) AS item_id,
                       unnest($3::text[]) AS url,
                       unnest($4::text[]) AS nome) AS v
         WHERE d."importRef" = v.ref
           AND d."origem" = 'importacao_planilha'
           AND d."sharepointItemId" IS NULL
           AND d."ativo" = true`,
        pgArr(refs), pgArr(itemIds), pgArr(urls), pgArr(nomes)
      );
    } catch (e) {
      return NextResponse.json({ success: false, error: "Falha ao vincular os PDFs: " + e.message }, { status: 500 });
    }
  }

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "CASAR_PDFS_QUALIDADE", entity: "DocumentoQualidade", entityId: "-", diff: { casados, totalPdfs: mapa.totalPdfs } } })
    .catch(() => {});

  return NextResponse.json({ success: true, casados, totalPdfs: mapa.totalPdfs });
}
