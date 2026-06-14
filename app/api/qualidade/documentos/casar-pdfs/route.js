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
export const maxDuration = 60;

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

  const url = new URL(req.url).searchParams.get("url") || process.env.SHAREPOINT_CERTS_URL;
  if (!url) return NextResponse.json({ success: false, error: "Informe a URL de compartilhamento da pasta de certificados." }, { status: 400 });

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

  const url = body.url || process.env.SHAREPOINT_CERTS_URL;
  if (!url) return NextResponse.json({ success: false, error: "Informe a URL de compartilhamento da pasta de certificados." }, { status: 400 });

  let mapa;
  try {
    mapa = await mapearCertificados(url);
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao ler do SharePoint: " + e.message }, { status: 502 });
  }

  // Um updateMany por PDF (vincula todos os índices da faixa que ainda não têm arquivo)
  let casados = 0;
  for (const a of mapa.arquivos) {
    if (!a.indices.length) continue;
    const res = await prismaDirect.documentoQualidade.updateMany({
      where: { origem: "importacao_planilha", importRef: { in: a.indices }, sharepointItemId: null, ativo: true },
      data: { sharepointItemId: a.id, sharepointUrl: a.webUrl || null, arquivoNome: a.name, arquivoTipo: "application/pdf" },
    });
    casados += res.count;
  }

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "CASAR_PDFS_QUALIDADE", entity: "DocumentoQualidade", entityId: "-", diff: { casados, totalPdfs: mapa.totalPdfs } } })
    .catch(() => {});

  return NextResponse.json({ success: true, casados, totalPdfs: mapa.totalPdfs });
}
