import "server-only";
import { prisma } from "./prisma";
import { rotuloRevisao } from "./databook-revisao";

// Entrega de um volume SEM passar o arquivo pela memória da função.
//
// Buffer.from(await res.arrayBuffer()) carregaria 90 MB (ou mais) na função a cada
// download — com dois clientes baixando ao mesmo tempo isso derruba a rota. Repassar
// o corpo da resposta faz o byte ir do blob direto para quem pediu.
export async function responderVolume(dataBookId, volume, { inline = false } = {}) {
  const book = await prisma.dataBookQualidade.findUnique({
    where: { id: dataBookId },
    select: { id: true, opNumero: true, revisao: true },
  });
  if (!book) return new Response("Data book não encontrado.", { status: 404 });

  const arq = await prisma.dataBookArquivo.findUnique({
    where: { dataBookId_revisao_volume: { dataBookId: book.id, revisao: book.revisao, volume: Number(volume) } },
  });
  if (!arq) return new Response("Volume ainda não gerado.", { status: 404 });

  const r = await fetch(arq.url);
  if (!r.ok || !r.body) return new Response("Arquivo indisponível no storage.", { status: 502 });

  const rev = rotuloRevisao(book.revisao);
  const nome = `Data Book OP-${String(book.opNumero).padStart(3, "0")} ${rev} - Vol ${String(arq.volume).padStart(2, "0")}.pdf`;
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${nome.replace(/["\r\n]/g, "")}"`);
  if (arq.tamanho) headers.set("Content-Length", String(arq.tamanho));
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(r.body, { status: 200, headers });
}
