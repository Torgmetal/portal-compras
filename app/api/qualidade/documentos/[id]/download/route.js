// GET /api/qualidade/documentos/[id]/download[?inline=1]
// Proxy autenticado (só ADMIN/QUALIDADE): busca o arquivo do Blob server-side e
// faz stream — o link do Blob nunca é exposto. inline=1 abre no navegador.
import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";
import { fetchRhItemResponse } from "@/lib/sharepoint";
import { dispArquivo } from "@/lib/arquivo-http";
import { pdfDoRelatorio, fonteDeInspecao } from "@/lib/relatorio-pdf-fonte";

const registroLog = log("api/qualidade/documentos/download");

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * O PDF do relatório de inspeção, montado em memória.
 *
 * ⚠⚠ ELE NÃO TEM ARQUIVO — É MONTADO NA HORA. O `arquivoUrl` do documento é a rota deste portal
 * que renderiza o PDF, e ela exige sessão: buscá-la por `fetch` daqui daria 401, e antes disto a
 * URL nem chegava a ser tentada (não é Blob, não tem itemId) — respondia 400 "Arquivo inválido",
 * que foi o que o Matheus viu no botão do olho (15/09/2026). Montar em memória resolve os dois, e
 * ainda ignora o host gravado: havia documento com `localhost:3000` no banco de PRODUÇÃO, de quem
 * fechou a inspeção rodando em dev.
 */
async function servirInspecao(doc, insp, inline) {
  const pdf = await pdfDoRelatorio(insp.relatorioId, { revisao: insp.revisao, exigirOp: insp.exigirOp });
  const h = new Headers();
  h.set("Content-Type", "application/pdf");
  h.set("Content-Disposition", dispArquivo(doc.arquivoNome || pdf.nome, inline ? "inline" : "attachment"));
  h.set("Cache-Control", "private, no-store");
  return new Response(pdf.bytes, { status: 200, headers: h });
}

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const doc = await prisma.documentoQualidade.findUnique({
    where: { id: params.id },
    // ⚠ `origem` e `opNumero` não são enfeite no select: são as duas amarrações de
    // `fonteDeInspecao`, e sem elas o ramo do relatório se recusa a servir.
    select: { arquivoUrl: true, arquivoNome: true, arquivoTipo: true, sharepointItemId: true, origem: true, opNumero: true },
  });
  if (!doc?.arquivoUrl && !doc?.sharepointItemId) {
    return NextResponse.json({ error: "Documento sem arquivo" }, { status: 404 });
  }

  // ⚠⚠ `arquivoUrl` NEM SEMPRE É BLOB — E O CAMINHO FALHAVA ANTES DE TENTAR O SHAREPOINT.
  // Vitor (23/08/2026): "os arquivos não estão sendo possíveis de baixar nem visualizar".
  //
  // O certificado importado da planilha de rastreabilidade guarda em `arquivoUrl` a URL WEB do
  // SharePoint (…/SERVIDOR/Almoxarifado/01. Rastreabilidade/Certificados 2025/R 251768 a 775.pdf),
  // não uma URL do Blob. O código validava com `assertBlobUrlSegura`, que lança, e o `catch`
  // devolvia 400 "Arquivo inválido" — SEM NUNCA CHEGAR no ramo do SharePoint, mesmo com o
  // `sharepointItemId` gravado ao lado. Medido: 2.790 dos 3.177 documentos com `arquivoUrl` são
  // do SharePoint, e TODOS os 2.790 têm o itemId. Nenhum deles baixava.
  //
  // ⚠ a defesa de SSRF continua inteira: URL que não é do Blob não é buscada por URL nenhuma — vai
  // pelo item do SharePoint, que é id opaco no drive da empresa. O que muda é que agora ela cai
  // para o SharePoint em vez de morrer em 400.
  const inline = new URL(req.url).searchParams.get("inline") === "1";

  // O relatório de inspeção não tem binário — ver `servirInspecao`.
  const insp = fonteDeInspecao(doc);
  if (insp) {
    try {
      return await servirInspecao(doc, insp, inline);
    } catch (e) {
      // ⚠ Só a mensagem que EU escrevi chega ao cliente (404/409). Falha inesperada de Prisma ou
      // do render vira texto genérico — `e.message` cru entregava nome de tabela e caminho de
      // arquivo a quem abriu um PDF (parecer do Codex, 15/09/2026).
      const meu = e.status === 404 || e.status === 409;
      if (!meu) registroLog.erro("falha ao montar o PDF da inspeção:", e?.message);
      return NextResponse.json(
        { error: meu ? e.message : "Não consegui montar o PDF deste relatório." },
        { status: e.status || 502 },
      );
    }
  }

  return servirArquivo(doc, inline);
}

/** Blob (fetch direto) ou item do SharePoint (por id). O que não for nenhum dos dois é 400. */
async function servirArquivo(doc, inline) {
  let res;
  if (isBlobUrlSegura(doc.arquivoUrl)) {
    res = await fetch(doc.arquivoUrl);
  } else if (doc.sharepointItemId) {
    res = await fetchRhItemResponse(doc.sharepointItemId); // genérico: baixa item por id no drive padrão
  } else {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }
  if (!res.ok || !res.body) return NextResponse.json({ error: "Falha ao buscar arquivo" }, { status: 502 });

  const nome = (doc.arquivoNome || "documento").replace(/["\r\n]/g, "");
  const headers = new Headers();
  headers.set("Content-Type", doc.arquivoTipo || res.headers.get("content-type") || "application/octet-stream");
  headers.set("Content-Disposition", dispArquivo(nome, inline ? "inline" : "attachment"));
  const len = res.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, no-store");
  return new Response(res.body, { status: 200, headers });
}
