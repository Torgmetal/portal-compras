// GET /api/qualidade/data-books/assinar/[token]/pdf — PÚBLICO: baixa o PDF do data
// book via token de assinatura (qualquer etapa da cadeia pode visualizar/baixar).
import { prisma } from "@/lib/prisma";
import { gerarDataBookPDF } from "@/lib/databook-pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req, { params }) {
  const etapa = await prisma.dataBookAssinatura.findUnique({ where: { token: params.token }, select: { dataBookId: true } });
  if (!etapa) return new Response("Link inválido ou expirado.", { status: 404 });

  const { bytes, filename } = await gerarDataBookPDF(etapa.dataBookId);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    },
  });
}
