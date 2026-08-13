// GET /api/qualidade/auditorias/[id]/pdf — Relatório de Auditoria Externa (interno). ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarAuditoriaExternaPDF } from "@/lib/auditoria-externa-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const a = await prisma.auditoria.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });

  let out;
  try { out = await gerarAuditoriaExternaPDF(a); }
  catch (e) { return new NextResponse("Falha ao gerar o PDF: " + (e.message || ""), { status: 500 }); }

  return new NextResponse(Buffer.from(out.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${out.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
