// POST /api/qualidade/data-books/secao/[secaoId]/popular-procedimentos
// Vincula à seção os procedimentos da Torg (SISTEMA / tipo "Procedimento") aplicáveis
// ao processo dela — casamento pelo nome via SECAO_PROCEDIMENTOS. Ex.: §14 puxa o
// PO-05 (pintura)/POI 05; §12 puxa PO-06/PO-15/PI-QUA. Idempotente (skipDuplicates).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { secaoUsaProcedimentos, procedimentoCasaSecao, whereProcedimentos } from "@/lib/databook-secoes";

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
  if (!secaoUsaProcedimentos(secao.numero)) {
    return NextResponse.json({ success: false, error: "Esta seção não possui procedimentos associados." }, { status: 400 });
  }

  const procs = await prisma.documentoQualidade.findMany({
    where: whereProcedimentos(),
    select: { id: true, nome: true },
  });
  const aplicaveis = procs.filter((p) => procedimentoCasaSecao(p.nome, secao.numero));
  if (!aplicaveis.length) {
    return NextResponse.json({ success: true, vinculados: 0, total: 0, semDocs: true });
  }

  const res = await prisma.dataBookSecaoDoc.createMany({
    data: aplicaveis.map((d) => ({ secaoId: params.secaoId, documentoId: d.id })),
    skipDuplicates: true,
  });
  await prisma.dataBookSecao.update({ where: { id: params.secaoId }, data: { estado: "ANEXADO" } });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "POPULAR_SECAO_PROCEDIMENTOS_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: { numero: secao.numero, novos: res.count, aplicaveis: aplicaveis.length } } })
    .catch(() => {});

  return NextResponse.json({ success: true, vinculados: res.count, total: aplicaveis.length });
}
