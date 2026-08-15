// GET /api/qualidade/auditorias/[id]/portal-pdf — índice/capa dos documentos publicados
// (o que o auditor vê no portal) + link do portal. ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { baseUrlDe } from "@/lib/databook-assinaturas";
import { gerarAuditoriaPortalPDF } from "@/lib/auditoria-portal-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const a = await prisma.auditoria.findUnique({ where: { id: params.id }, include: { documentos: true } });
  if (!a) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });

  const base = baseUrlDe(req);
  const portalUrl = a.token ? `${base}/portal-cliente/${a.token}` : null;
  // Base p/ abrir CADA documento direto no navegador (proxy público, inline), sem voltar ao portal.
  const docBase = a.token ? `${base}/api/qualidade/auditorias/portal/${a.token}/doc` : null;

  let out;
  try { out = await gerarAuditoriaPortalPDF(a, { portalUrl, docBase }); }
  catch (e) { return new NextResponse("Falha ao gerar o PDF: " + (e.message || ""), { status: 500 }); }

  return new NextResponse(Buffer.from(out.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${out.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
