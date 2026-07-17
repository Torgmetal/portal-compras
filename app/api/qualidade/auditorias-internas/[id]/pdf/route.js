// GET /api/qualidade/auditorias-internas/[id]/pdf — relatório de auditoria
// interna em PDF (layout Torg). Abre inline pra prévia/impressão.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarAuditoriaInternaPDF } from "@/lib/auditoria-interna-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const a = await prisma.auditoriaInterna.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });

  let out;
  try { out = await gerarAuditoriaInternaPDF(a); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  await prisma.auditLog.create({ data: { userId: user.id, action: "EXPORTAR_AUDITORIA_INTERNA_PDF", entity: "AuditoriaInterna", entityId: a.id, diff: {} } }).catch(() => {});

  return new Response(Buffer.from(out.bytes), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.filename}"` },
  });
}
