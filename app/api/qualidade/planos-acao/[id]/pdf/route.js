// GET /api/qualidade/planos-acao/[id]/pdf — plano de ação 5W2H em PDF.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarPlanoAcaoPDF } from "@/lib/plano-acao-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const p = await prisma.planoAcao.findUnique({ where: { id: params.id } });
  if (!p) return NextResponse.json({ success: false, error: "Plano não encontrado" }, { status: 404 });

  let out;
  try { out = await gerarPlanoAcaoPDF(p); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  await prisma.auditLog.create({ data: { userId: user.id, action: "EXPORTAR_PLANO_ACAO_PDF", entity: "PlanoAcao", entityId: p.id, diff: {} } }).catch(() => {});
  return new Response(Buffer.from(out.bytes), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.filename}"` } });
}
