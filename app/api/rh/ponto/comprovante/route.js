// GET /api/rh/ponto/comprovante?competencia=YYYY-MM — comprovante de conferência
// (ciência) dos cartões de ponto da competência: PDF com quem visualizou/confirmou,
// data/hora e IP. Serve como comprovante de assinatura eletrônica. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarComprovantePontoPDF } from "@/lib/ponto-comprovante-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  let user;
  try { user = await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const competencia = new URL(req.url).searchParams.get("competencia");
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) return NextResponse.json({ success: false, error: "Competência inválida (AAAA-MM)" }, { status: 400 });

  // Só os itens casados a um funcionário (os que têm capacidade de confirmar).
  const itens = await prisma.pontoItem.findMany({
    where: { ponto: { competencia }, funcionarioId: { not: null }, pdfUrl: { not: null } },
    orderBy: [{ nome: "asc" }, { pisArquivo: "asc" }],
    select: { nome: true, empresa: true, status: true, visualizadoEm: true, confirmadoEm: true, confirmadoIp: true, funcionario: { select: { nome: true } } },
  });

  let out;
  try { out = await gerarComprovantePontoPDF(competencia, itens); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  await prisma.auditLog.create({ data: { userId: user.id, action: "COMPROVANTE_PONTO", entity: "PontoCompetencia", entityId: competencia, diff: { competencia, total: itens.length } } }).catch(() => {});

  return new Response(Buffer.from(out.bytes), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${out.filename}"` } });
}
