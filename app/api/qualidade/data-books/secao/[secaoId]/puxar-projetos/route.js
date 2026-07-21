// POST /api/qualidade/data-books/secao/[secaoId]/puxar-projetos
// §02 Desenhos as-built: puxa do SERVIDOR os desenhos de Montagem + Conjunto da
// OP (ver lib/projetos-databook.js) e vincula à seção, apontando pro arquivo no
// SharePoint (sem re-upload). Dedupe por sharepointItemId. Idempotente. O merge
// do PDF baixa esses docs do drive SERVIDOR (origem "projeto_servidor").
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { buscarDesenhosOP } from "@/lib/projetos-databook";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const secao = await prisma.dataBookSecao.findUnique({
    where: { id: params.secaoId },
    select: { id: true, numero: true, dataBook: { select: { opNumero: true } } },
  });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });
  if (secao.numero !== "02") return NextResponse.json({ success: false, error: "Só a §02 puxa desenhos do servidor." }, { status: 400 });
  const opNumero = secao.dataBook?.opNumero;
  if (!opNumero) return NextResponse.json({ success: false, error: "Data book sem OP vinculada" }, { status: 400 });

  const { desenhos, erro } = await buscarDesenhosOP(opNumero);
  if (erro && !desenhos.length) return NextResponse.json({ success: false, error: erro }, { status: 502 });
  if (!desenhos.length) return NextResponse.json({ success: true, vinculados: 0, criados: 0, total: 0, semDesenhos: true });

  // Upsert dos documentos (aponta pro SharePoint SERVIDOR, sem re-upload). Dedupe por sharepointItemId.
  const ids = desenhos.map((d) => d.id);
  const existentes = await prisma.documentoQualidade.findMany({ where: { sharepointItemId: { in: ids } }, select: { id: true, sharepointItemId: true } });
  const porSp = new Map(existentes.map((e) => [e.sharepointItemId, e.id]));
  let criados = 0;
  const docIds = [];
  for (const d of desenhos) {
    let docId = porSp.get(d.id);
    if (!docId) {
      try {
        const novo = await prisma.documentoQualidade.create({
          data: {
            nome: `${d.area} · ${d.name.replace(/\.[a-z0-9]+$/i, "")}`.slice(0, 300),
            categoria: "PROJETO",
            tipo: "Desenho as-built",
            opNumero,
            origem: "projeto_servidor",
            sharepointItemId: d.id,
            sharepointUrl: d.url,
            arquivoNome: d.name,
            arquivoTipo: d.mime,
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
    .create({ data: { userId: user.id, action: "PUXAR_PROJETOS_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: { opNumero, criados, vinculados: res.count, total: desenhos.length } } })
    .catch(() => {});

  return NextResponse.json({ success: true, vinculados: res.count, criados, total: desenhos.length });
}
