// GET /api/qualidade/data-books/aceite/[token]/pdf — PÚBLICO: baixa o PDF via token.
import { prisma } from "@/lib/prisma";
import { gerarDataBookPDF } from "@/lib/databook-pdf";
import { responderVolume } from "@/lib/databook-download";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req, { params }) {
  const book = await prisma.dataBookQualidade.findUnique({ where: { tokenCliente: params.token }, select: { id: true, revisao: true } });
  if (!book) return new Response("Link inválido ou expirado.", { status: 404 });

  // ⚠ GERADO JÁ? ENTREGA O PRONTO. Este link existia gerando o PDF inteiro no clique
  // do cliente, dentro de 120 s — com data book grande ele esperava e levava timeout.
  // Quando há volumes, o Volume 01 (o livro) é o que este link entrega, e a página de
  // aceite lista os demais.
  const vol1 = await prisma.dataBookArquivo.findFirst({
    where: { dataBookId: book.id, revisao: book.revisao },
    orderBy: { volume: "asc" },
  });
  if (vol1) {
    const inline = new URL(req.url).searchParams.get("inline") === "1";
    return responderVolume(book.id, vol1.volume, { inline });
  }

  const { bytes, filename } = await gerarDataBookPDF(book.id);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(filename, inline ? "inline" : "attachment"),
    },
  });
}
