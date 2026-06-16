// POST /api/qualidade/data-books/secao/[secaoId]/popular-material
// Vincula de uma vez TODOS os certificados de material (categoria MATERIAL) da OP
// do data book à seção — usado na Seção 04 (Certificados de usina / rastreabilidade).
// Idempotente: createMany com skipDuplicates (pula os já vinculados). Marca a seção
// como ANEXADO quando há certificados. Escrita em massa num único statement.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { classificarMaterial, GRUPO_POR_SECAO } from "@/lib/databook-secoes";

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
    select: { id: true, numero: true, dataBook: { select: { opNumero: true } } },
  });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });

  const opNumero = secao.dataBook?.opNumero;
  if (!opNumero) return NextResponse.json({ success: false, error: "Data book sem OP vinculada" }, { status: 400 });

  // Certificados de material da OP (rastreabilidade importada do CMR), filtrados pelo
  // grupo da seção: §04 aço estrutural, §05 fixadores, §15 tintas. Outras seções: todos.
  const grupo = GRUPO_POR_SECAO[secao.numero] || null;
  const todos = await prisma.documentoQualidade.findMany({
    where: { ativo: true, categoria: "MATERIAL", opNumero },
    select: { id: true, nome: true },
  });
  const docs = grupo ? todos.filter((d) => classificarMaterial(d.nome) === grupo) : todos;
  if (!docs.length) {
    return NextResponse.json({ success: true, vinculados: 0, total: 0, semDocs: true });
  }

  const res = await prisma.dataBookSecaoDoc.createMany({
    data: docs.map((d) => ({ secaoId: params.secaoId, documentoId: d.id })),
    skipDuplicates: true,
  });

  // tem certificados agora → marca a seção como anexada (a trava de vencido continua valendo)
  await prisma.dataBookSecao.update({ where: { id: params.secaoId }, data: { estado: "ANEXADO" } });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "POPULAR_SECAO_MATERIAL_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: { opNumero, novos: res.count, totalMaterial: docs.length } } })
    .catch(() => {});

  return NextResponse.json({ success: true, vinculados: res.count, total: docs.length });
}
