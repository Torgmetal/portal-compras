// GET /api/qualidade/rnc/[id]/pdf — gera o PDF (FORM 20) da RNC.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarRncPDF } from "@/lib/rnc-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rnc = await prisma.naoConformidade.findUnique({ where: { id: params.id } });
  if (!rnc) return NextResponse.json({ error: "RNC não encontrada" }, { status: 404 });
  let plano = null;
  if (rnc.planoAcaoId) plano = await prisma.planoAcao.findUnique({ where: { id: rnc.planoAcaoId }, select: { numero: true, status: true, itens: true } });

  let pdf;
  try { pdf = await gerarRncPDF(rnc, plano); }
  catch (e) { return NextResponse.json({ error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"` },
  });
}
