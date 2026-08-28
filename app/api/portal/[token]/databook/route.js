// GET — o cliente baixa UM volume do Data Book pelo portal dele: ?volume=3
//
// Vitor (24/08/2026), escolhendo entre listar e entregar: liberar no portal DEPOIS do aceite, com
// download. Até então o portal listava os volumes e não entregava nada — a única entrega era o
// e-mail que sai quando o cliente assina a 4ª etapa da cadeia.
//
// ⚠⚠ SÓ DEPOIS DO ACEITE. As quatro assinaturas (Elaborador → Inspetor → Responsável Técnico →
// Cliente) são o que faz o livro valer; entregar antes é entregar rascunho com cara de definitivo.
// O status `ACEITO` é gravado pela última assinatura da cadeia, então checá-lo aqui é checar a
// cadeia inteira sem reabrir a tabela de etapas.
//
// ⚠ E SÓ A REVISÃO CORRENTE. Data book emitido só muda por revisão, e revisão zera as assinaturas
// — um volume da R00 continua no Blob depois da R01 existir, e servi-lo seria entregar a versão
// que o cliente justamente deixou de ter aceitado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { secoesDoPortal } from "@/lib/portal-cliente";
import { isBlobUrlSegura } from "@/lib/blob-url";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req, { params }) {
  const { token } = await params;
  const volume = Number(new URL(req.url).searchParams.get("volume"));
  if (!Number.isInteger(volume) || volume < 1) return new NextResponse("Volume não informado.", { status: 400 });

  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") return new NextResponse("Link inválido.", { status: 404 });

  // ⚠ a seção desligada tem de desligar o download junto: sem isto o bloco some da tela e o
  // arquivo segue ao alcance de quem souber o endereço. Mesmo raciocínio da rota /doc.
  if (!secoesDoPortal(portal).includes("DATABOOK")) {
    return new NextResponse("O Data Book não faz parte do portal desta obra.", { status: 403 });
  }

  const book = await prisma.dataBookQualidade.findFirst({
    where: { opNumero: portal.opNumero, status: "ACEITO" },
    select: { id: true, revisao: true, opNumero: true },
  });
  if (!book) return new NextResponse("O Data Book desta obra ainda não foi liberado.", { status: 404 });

  const arq = await prisma.dataBookArquivo.findFirst({
    where: { dataBookId: book.id, revisao: book.revisao, volume },
    select: { url: true, titulo: true, volume: true },
  });
  if (!arq?.url) return new NextResponse("Volume não encontrado.", { status: 404 });

  // ⚠ PROXY, não redirect: a URL do Blob é pública para quem a tem. Devolvê-la ao navegador daria
  // ao cliente um endereço permanente, fora do portal, que sobrevive a despublicar a obra.
  if (!isBlobUrlSegura(arq.url)) {
    console.error("[portal/databook] URL fora do Blob:", arq.url);
    return new NextResponse("Não foi possível abrir este volume agora. Fale com a Qualidade da Torg.", { status: 502 });
  }

  let res;
  try {
    res = await fetch(arq.url);
  } catch (e) {
    // ⚠ o motivo fica no log, não na tela de quem comprou a obra — ver o mesmo cuidado em /doc.
    console.error("[portal/databook] falha ao buscar volume:", e);
    return new NextResponse("Não foi possível abrir este volume agora. Fale com a Qualidade da Torg.", { status: 502 });
  }
  if (!res.ok || !res.body) {
    console.error("[portal/databook] Blob respondeu", res.status);
    return new NextResponse("Não foi possível abrir este volume agora. Fale com a Qualidade da Torg.", { status: 502 });
  }

  const rev = `R${String(book.revisao).padStart(2, "0")}`;
  const nome = `Data Book OP-${book.opNumero} ${rev} - Vol ${String(volume).padStart(2, "0")}.pdf`;
  const headers = new Headers({
    "Content-Type": "application/pdf",
    // ⚠ volume passa de 90 MB; `inline` faria o navegador tentar renderizar tudo antes de mostrar
    // qualquer coisa. Anexo baixa e abre no leitor do cliente, que é onde ele vai ler mesmo.
    "Content-Disposition": dispArquivo(nome, "attachment"),
    "Cache-Control": "private, no-store",
  });
  const len = res.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  return new Response(res.body, { status: 200, headers });
}
