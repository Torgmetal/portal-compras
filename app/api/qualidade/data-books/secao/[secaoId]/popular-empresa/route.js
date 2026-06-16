// POST /api/qualidade/data-books/secao/[secaoId]/popular-empresa
// Vincula à seção TODOS os documentos da empresa (Controle de Documentos) da
// categoria/tipo correspondente — soldador (08), inspetor (13), EPS/WPS (07),
// calibração (19). Globais: não dependem da OP. Idempotente (skipDuplicates).
// Inclui docs SEM validade (ex.: CQS de soldador, que valem por continuidade).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { whereDocsEmpresa, secaoUsaEmpresa } from "@/lib/databook-secoes";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const secao = await prisma.dataBookSecao.findUnique({
    where: { id: params.secaoId },
    select: { id: true, numero: true },
  });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });
  if (!secaoUsaEmpresa(secao.numero)) {
    return NextResponse.json({ success: false, error: "Esta seção não usa documentos da empresa" }, { status: 400 });
  }

  const docs = await prisma.documentoQualidade.findMany({
    where: whereDocsEmpresa(secao.numero),
    select: { id: true },
  });
  if (!docs.length) {
    return NextResponse.json({ success: true, vinculados: 0, total: 0, semDocs: true });
  }

  const res = await prisma.dataBookSecaoDoc.createMany({
    data: docs.map((d) => ({ secaoId: params.secaoId, documentoId: d.id })),
    skipDuplicates: true,
  });
  await prisma.dataBookSecao.update({ where: { id: params.secaoId }, data: { estado: "ANEXADO" } });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "POPULAR_SECAO_EMPRESA_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: { numero: secao.numero, novos: res.count, total: docs.length } } })
    .catch(() => {});

  return NextResponse.json({ success: true, vinculados: res.count, total: docs.length });
}
