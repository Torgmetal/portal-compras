// GET /api/relatorio/aceite/[token]/pdf — PÚBLICO: PDF do relatório pelo token.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gerarRelatorioStatusPDF } from "@/lib/relatorio-status-pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(_req, { params }) {
  const rel = await prisma.relatorioStatus.findUnique({ where: { token: params.token } });
  if (!rel) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if (rel.opId) {
    const op = await prisma.oP.findUnique({ where: { id: rel.opId }, select: { refCliente: true } });
    rel.refCliente = op?.refCliente || null;
  }
  let out;
  try { out = await gerarRelatorioStatusPDF(rel); }
  catch { return NextResponse.json({ error: "Falha ao gerar o PDF" }, { status: 500 }); }
  const nome = out.filename.replace(/["\r\n]/g, "");
  return new Response(out.bytes, {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nome}"`, "Cache-Control": "private, no-store" },
  });
}
