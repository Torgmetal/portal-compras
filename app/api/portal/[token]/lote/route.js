// POST — o cliente baixa VÁRIOS documentos de uma vez, num ZIP.
//
// Vitor (22/08/2026): "e até mesmo baixar em lote todos os certificados que ele escolher".
//
// ⚠ O ZIP É MONTADO EM MEMÓRIA, e por isso tem teto. Certificado de aço tem centenas de KB; 60
// deles cabem com folga numa função serverless, 500 não. O limite recusa antes de tentar, com o
// número na mensagem — melhor que estourar no meio e devolver um arquivo corrompido, que o cliente
// só descobre ao abrir.
import { NextResponse } from "next/server";
import PizZip from "pizzip";
import { prisma } from "@/lib/prisma";
import { baixarDocumento, resolverDriveServidor } from "@/lib/databook-arquivo";
import { secoesDoPortal, portalExpirado } from "@/lib/portal-cliente";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX = 60;

export async function POST(req, { params }) {
  const { token } = await params;
  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO" || portalExpirado(portal)) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter(Boolean))] : [];
  if (!ids.length) return NextResponse.json({ error: "Escolha ao menos um documento." }, { status: 400 });
  if (ids.length > MAX) {
    return NextResponse.json({ error: `São ${ids.length} documentos — baixe em lotes de até ${MAX}.` }, { status: 413 });
  }

  const ativas = secoesDoPortal(portal);
  const docs = await prisma.documentoQualidade.findMany({
    where: { id: { in: ids }, opNumero: portal.opNumero, ativo: true },
    select: { id: true, nome: true, categoria: true, importRef: true, arquivoUrl: true, sharepointItemId: true, sharepointUrl: true, origem: true },
  });
  const liberados = docs.filter((d) =>
    d.categoria === "MATERIAL" ? ativas.includes("CERTIFICADOS") : ativas.includes("DOCUMENTOS"));
  if (!liberados.length) return NextResponse.json({ error: "Nenhum documento disponível." }, { status: 403 });

  const zip = new PizZip();
  const drive = await resolverDriveServidor(liberados);
  const usados = new Set();
  let dentro = 0;
  const falhas = [];

  for (const d of liberados) {
    try {
      const buf = await baixarDocumento(d, drive);
      // ⚠ o R vai NO NOME DO ARQUIVO. É por ele que o cliente liga o certificado à peça; um zip de
      // sessenta PDFs com nomes de material repetidos seria inútil ao abrir.
      let nome = `${d.importRef ? `R ${d.importRef} - ` : ""}${String(d.nome).replace(/[\\/:*?"<>|]/g, "_")}`.slice(0, 110);
      let n = 2;
      while (usados.has(`${nome}.pdf`)) nome = `${nome.slice(0, 105)} (${n++})`;
      usados.add(`${nome}.pdf`);
      zip.file(`${nome}.pdf`, buf);
      dentro++;
    } catch (e) {
      falhas.push(d.nome);
    }
  }

  if (!dentro) return NextResponse.json({ error: "Não consegui abrir nenhum dos documentos escolhidos." }, { status: 502 });

  const bytes = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  const nomeZip = `Certificados OP-${String(portal.opNumero).padStart(3, "0")}.zip`;
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": dispArquivo(nomeZip, "attachment"),
      // ⚠ o que NÃO entrou vai num cabeçalho, para a tela poder avisar: zip com menos arquivos do
      // que o pedido, em silêncio, é o cliente achando que tem tudo.
      "X-Falhas": String(falhas.length),
      "Cache-Control": "no-store",
    },
  });
}
