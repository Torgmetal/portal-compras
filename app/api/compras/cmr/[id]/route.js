// DELETE /api/compras/cmr/[id] — exclui um lançamento CMR (DocumentoQualidade MATERIAL).
// Grava AuditLog (CMR_EXCLUIR) com o que foi excluído, quem e quando, e LIMPA a linha do R na
// planilha do SharePoint (mantém o índice reservado) pra a reconciliação não re-importar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CMR_CAT } from "@/lib/cmr";
import { limparLinhaCmr } from "@/lib/cmr-sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];

export async function DELETE(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const doc = await prisma.documentoQualidade.findUnique({
    where: { id: params.id },
    select: { id: true, categoria: true, importRef: true, nome: true, fornecedor: true, nfNumero: true, opNumero: true, numeroDocumento: true, pesoKg: true, quantidade: true },
  });
  if (!doc || doc.categoria !== CMR_CAT) return NextResponse.json({ success: false, error: "Lançamento não encontrado." }, { status: 404 });

  await prisma.documentoQualidade.delete({ where: { id: doc.id } });

  // Log da exclusão (quem, quando, o quê) — visível na tela.
  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "CMR_EXCLUIR", entity: "DocumentoQualidade", entityId: doc.id,
      diff: { importRef: doc.importRef, nome: doc.nome, fornecedor: doc.fornecedor, nf: doc.nfNumero, obra: doc.opNumero, certificado: doc.numeroDocumento, pesoKg: doc.pesoKg, quantidade: doc.quantidade },
    },
  }).catch(() => {});

  // Limpa a linha na planilha (best-effort) pra a reconciliação não trazer de volta.
  let planilha = null;
  try {
    const ano = 2000 + Number(String(doc.importRef || "").slice(0, 2));
    if (ano >= 2000 && ano < 2100 && doc.importRef) planilha = await limparLinhaCmr(ano, doc.importRef);
  } catch (e) { planilha = { ok: false, erro: e.message }; }

  return NextResponse.json({ success: true, importRef: doc.importRef, planilha });
}
