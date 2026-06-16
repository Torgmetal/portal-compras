// POST /api/qualidade/data-books/secao/[secaoId]/puxar-relatorios
// Puxa do servidor (SharePoint) os relatórios da OP da seção e vincula a ela:
//   §11 → /Produção/2. SGQ/Dimensional   §12 → Visual de Solda + LP
// Casa pelo código Tekla no nome do arquivo (DM_064_26_T67 → OP-067). Prefere os
// PDFs (pasta /PDF); cai pros .xlsx só se não houver PDF. Aponta pro arquivo no
// SharePoint (sem re-upload), dedupe por sharepointItemId. Idempotente.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { listChildrenByPath } from "@/lib/sharepoint";
import { SECAO_RELATORIOS_SERVIDOR, secaoUsaRelatoriosServidor, arquivoCasaOP } from "@/lib/databook-secoes";

export const runtime = "nodejs";
export const maxDuration = 120;

const EXT_OK = /\.(pdf|xlsx?|png|jpe?g)$/i;

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const secao = await prisma.dataBookSecao.findUnique({
    where: { id: params.secaoId },
    select: { id: true, numero: true, dataBook: { select: { opNumero: true } } },
  });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });
  if (!secaoUsaRelatoriosServidor(secao.numero)) {
    return NextResponse.json({ success: false, error: "Esta seção não puxa relatórios do servidor." }, { status: 400 });
  }
  const opNumero = secao.dataBook?.opNumero;
  if (!opNumero) return NextResponse.json({ success: false, error: "Data book sem OP vinculada" }, { status: 400 });

  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  if (!driveId) return NextResponse.json({ success: false, error: "SHAREPOINT_DRIVE_ID não configurado" }, { status: 500 });

  const cfg = SECAO_RELATORIOS_SERVIDOR[secao.numero];

  // Lista as pastas configuradas e casa os arquivos da OP. Pastas inexistentes são ignoradas.
  let achados = [];
  for (const pasta of cfg.pastas) {
    let filhos;
    try { filhos = await listChildrenByPath(driveId, `/${pasta}`); }
    catch { continue; }
    for (const it of filhos || []) {
      if (it.file && EXT_OK.test(it.name) && arquivoCasaOP(it.name, opNumero)) {
        achados.push({ id: it.id, name: it.name, webUrl: it.webUrl || null, mime: it.file.mimeType || null, pdf: /\.pdf$/i.test(it.name) });
      }
    }
  }
  if (!achados.length) {
    return NextResponse.json({ success: true, vinculados: 0, criados: 0, total: 0, semDocs: true });
  }
  // Prefere PDFs quando houver (data book usa o relatório final em PDF).
  if (achados.some((a) => a.pdf)) achados = achados.filter((a) => a.pdf);
  // Dedupe por id (mesmo arquivo listado em mais de uma pasta).
  achados = [...new Map(achados.map((a) => [a.id, a])).values()];

  // Upsert dos documentos (aponta pro SharePoint, sem re-upload). Dedupe por sharepointItemId.
  const ids = achados.map((a) => a.id);
  const existentes = await prisma.documentoQualidade.findMany({ where: { sharepointItemId: { in: ids } }, select: { id: true, sharepointItemId: true } });
  const porSp = new Map(existentes.map((e) => [e.sharepointItemId, e.id]));
  let criados = 0;
  const docIds = [];
  for (const a of achados) {
    let docId = porSp.get(a.id);
    if (!docId) {
      try {
        const novo = await prisma.documentoQualidade.create({
          data: {
            nome: a.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 300),
            categoria: cfg.categoria,
            tipo: cfg.tipo,
            opNumero,
            origem: "servidor_sgq",
            sharepointItemId: a.id,
            sharepointUrl: a.webUrl,
            arquivoNome: a.name,
            arquivoTipo: a.mime,
            validado: false,
            createdById: user.id,
          },
          select: { id: true },
        });
        docId = novo.id;
        criados++;
      } catch { continue; }
    }
    docIds.push(docId);
  }

  const res = await prisma.dataBookSecaoDoc.createMany({
    data: docIds.map((documentoId) => ({ secaoId: params.secaoId, documentoId })),
    skipDuplicates: true,
  });
  await prisma.dataBookSecao.update({ where: { id: params.secaoId }, data: { estado: "ANEXADO" } });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "PUXAR_RELATORIOS_SERVIDOR_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: { numero: secao.numero, opNumero, criados, vinculados: res.count, total: achados.length } } })
    .catch(() => {});

  return NextResponse.json({ success: true, vinculados: res.count, criados, total: achados.length });
}
