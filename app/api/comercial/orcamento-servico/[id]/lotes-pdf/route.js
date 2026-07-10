// GET /api/comercial/orcamento-servico/[id]/lotes-pdf — Plano de Entregas (PDF)
// com os lotes do orçamento (local de entrega + itens). Só ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarLotesPDF } from "@/lib/lotes-entrega-pdf";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const o = await prisma.orcamentoServico.findUnique({ where: { id: params.id } });
  if (!o) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });

  let out;
  try { out = await gerarLotesPDF(o); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  await prisma.auditLog.create({ data: { userId: user.id, action: "GERAR_PLANO_ENTREGAS", entity: "OrcamentoServico", entityId: o.id, diff: {} } }).catch(() => {});

  return new Response(Buffer.from(out.bytes), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${out.filename}"` } });
}
