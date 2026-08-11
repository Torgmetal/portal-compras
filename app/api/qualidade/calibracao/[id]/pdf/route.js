// GET /api/qualidade/calibracao/[id]/pdf — Relatório de Avaliação de Calibração (PO-20). ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { numRAC } from "@/lib/calibracao";
import { gerarAvaliacaoCalibracaoPDF } from "@/lib/avaliacao-calibracao-pdf";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const doc = await prisma.documentoQualidade.findUnique({ where: { id: params.id } });
  if (!doc || doc.categoria !== "EQUIPAMENTOS") return new NextResponse("Certificado não encontrado.", { status: 404 });
  const av = await prisma.avaliacaoCalibracao.findUnique({ where: { documentoId: doc.id } });
  if (!av) return new NextResponse("Avaliação ainda não iniciada.", { status: 404 });

  let avaliadorNome = null;
  if (av.avaliadorId) { const u = await prisma.user.findUnique({ where: { id: av.avaliadorId }, select: { name: true, email: true } }); avaliadorNome = u?.name || u?.email || null; }

  const bytes = await gerarAvaliacaoCalibracaoPDF({ avaliacao: { ...av, avaliadorNome }, documento: doc });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Avaliacao Calibracao ${numRAC(av.numero)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
