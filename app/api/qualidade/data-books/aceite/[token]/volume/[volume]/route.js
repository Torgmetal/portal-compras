// GET — PÚBLICO: o cliente baixa um volume pelo token do link de aceite.
//
// ⚠ Aqui NÃO se gera nada. Antes o clique do cliente disparava a montagem do PDF
// inteiro numa função de 120 s — com um data book grande ele esperava e recebia
// timeout. Agora o arquivo já existe; a rota só entrega.
import { prisma } from "@/lib/prisma";
import { responderVolume } from "@/lib/databook-download";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  const book = await prisma.dataBookQualidade.findUnique({ where: { tokenCliente: params.token }, select: { id: true } });
  if (!book) return new Response("Link inválido ou expirado.", { status: 404 });
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return responderVolume(book.id, params.volume, { inline });
}
