// GET /api/qualidade/data-books/aceite/[token]/pdf — PÚBLICO: baixa o PDF via token.
import { prisma } from "@/lib/prisma";
import { gerarDataBookPDF } from "@/lib/databook-pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req, { params }) {
  const book = await prisma.dataBookQualidade.findUnique({ where: { tokenCliente: params.token }, select: { id: true } });
  if (!book) return new Response("Link inválido ou expirado.", { status: 404 });

  const { bytes, filename } = await gerarDataBookPDF(book.id);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    },
  });
}
