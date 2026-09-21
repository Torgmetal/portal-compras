// GET /api/qualidade/documentos/[id]/download[?inline=1]
// Proxy autenticado (só ADMIN/QUALIDADE): busca o arquivo do Blob server-side e
// faz stream — o link do Blob nunca é exposto. inline=1 abre no navegador.
import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";
import { baixarDocumento, ehUrlSharePoint } from "@/lib/databook-arquivo";
import { dispArquivo } from "@/lib/arquivo-http";
import { pdfDoRelatorio, fonteDeInspecao } from "@/lib/relatorio-pdf-fonte";
import { fonteDePit, pdfDoPit } from "@/lib/pit-pdf-fonte";

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
  h.set("X-Content-Type-Options", "nosniff");
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
    // ⚠ `origem` e `opNumero` são as duas amarrações de `fonteDeInspecao`; `sharepointUrl` é o
    // último recurso de `baixarDocumento` quando o itemId morre. Sem eles no select, o ramo do
    // relatório se recusa a servir e o socorro pelo caminho nunca dispara.
    select: { arquivoUrl: true, arquivoNome: true, arquivoTipo: true, sharepointItemId: true,
              sharepointUrl: true, origem: true, opNumero: true },
  });
  // ⚠ `sharepointUrl` conta como arquivo: é o campo do último recurso, e sem ele aqui um
  // documento que só tem o caminho gravado levava 404 antes de a escada ser sequer chamada
  // (apontado pelo Codex, 15/09/2026).
  if (!doc?.arquivoUrl && !doc?.sharepointItemId && !doc?.sharepointUrl) {
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

  const pit = fonteDePit(doc);
  if (pit) {
    try {
      const pdf = await pdfDoPit(prisma, pit);
      const h = new Headers();
      h.set("Content-Type", "application/pdf");
      h.set("Content-Disposition", dispArquivo(doc.arquivoNome || pdf.nome, inline ? "inline" : "attachment"));
      h.set("X-Content-Type-Options", "nosniff");
      h.set("Cache-Control", "private, no-store");
      return new Response(pdf.bytes, { status: 200, headers: h });
    } catch (e) {
      return NextResponse.json({ error: e.status === 404 ? e.message : "Não consegui montar o PDF do PIT." }, { status: e.status || 502 });
    }
  }

  return servirArquivo(doc, inline);
}

/** Blob (stream direto) ou SharePoint (pela mesma escada do data book). O resto é 400. */
async function servirArquivo(doc, inline) {
  // O Blob continua em STREAM: é o caminho dos uploads do portal, e um data book de dezenas de
  // megabytes não precisa passar inteiro pela memória da função para ser entregue.
  if (isBlobUrlSegura(doc.arquivoUrl)) return await streamDoBlob(doc, inline);

  // ⚠⚠ O SHAREPOINT VEM POR `baixarDocumento`, A MESMA FUNÇÃO QUE MONTA O LIVRO — e é isso que
  // conserta o olho (Matheus, 15/09/2026: o R 261085 da OP-103 dava erro). A rota tentava UMA
  // coisa só: o item por id no drive padrão. Quando esse id morre — e ele morre quando alguém
  // move ou renomeia o arquivo no SharePoint — vinha 502 "Falha ao buscar arquivo" com o PDF
  // intacto na pasta (conferido: `R 261085.pdf`, 309 KB, lá desde 24/08).
  //
  // `baixarDocumento` já sabia disso e tem a escada inteira: o drive provável pela origem, depois
  // o outro, e por último o CAMINHO, que sobrevive à troca de id. Ela nasceu de um caso idêntico
  // (o certificado do arame da OP-106, 28/08/2026) — o defeito não era novo, era o MESMO defeito
  // num segundo lugar, porque existiam duas implementações do mesmo download e só uma aprendeu.
  //
  // ⚠ A defesa de SSRF continua inteira: só entra aqui quem tem itemId ou URL do SharePoint da
  // empresa. URL de terceiro nunca é buscada — cai no 400 de sempre.
  if (!doc.sharepointItemId && !ehUrlSharePoint(doc.arquivoUrl) && !ehUrlSharePoint(doc.sharepointUrl)) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }
  try {
    return new Response(await baixarDocumento(doc), { status: 200, headers: cabecalhos(doc, inline) });
  } catch (e) {
    registroLog.erro("falha ao baixar do SharePoint:", doc.sharepointItemId, e?.message);
    return NextResponse.json({ error: "Falha ao buscar arquivo" }, { status: 502 });
  }
}

async function streamDoBlob(doc, inline) {
  const res = await fetch(doc.arquivoUrl).catch(() => null);
  if (!res?.ok || !res.body) return NextResponse.json({ error: "Falha ao buscar arquivo" }, { status: 502 });
  const headers = cabecalhos(doc, inline, res.headers.get("content-type"));
  const len = res.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  return new Response(res.body, { status: 200, headers });
}

// ⚠⚠ O QUE PODE ABRIR DENTRO DO PORTAL. `arquivoTipo` é texto livre no banco, gravado por
// importador, e prevalece sobre o tipo real. Um documento com `text/html` (ou `image/svg+xml`,
// que executa script) servido com `?inline=1` rodaria NA ORIGEM DO PORTAL, onde quem abriu tem
// sessão — e `nosniff` não protege contra um tipo declarado de propósito (achado ALTA do Codex,
// 15/09/2026). Fora desta lista o arquivo BAIXA em vez de abrir: anexo não executa.
//
// ⚠ Medido no acervo (15/09/2026): `arquivoTipo` é null em 5.029, `application/pdf` em 1.462 e
// `image/png` em 2. Nenhum documento legítimo perde a pré-visualização com este aperto.
const TIPOS_QUE_ABREM = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain",
]);

/** ⚠ Sem o content-type da resposta (o SharePoint vem por buffer), o PDF cai no que o banco diz. */
function cabecalhos(doc, inline, tipoDaResposta = null) {
  const nome = (doc.arquivoNome || "documento").replace(/["\r\n]/g, "");
  const ehPdf = /\.pdf($|\?)/i.test(doc.arquivoNome || doc.arquivoUrl || "");
  const tipo = doc.arquivoTipo || tipoDaResposta || (ehPdf ? "application/pdf" : "application/octet-stream");
  const podeAbrir = TIPOS_QUE_ABREM.has(String(tipo).split(";")[0].trim().toLowerCase());
  const h = new Headers();
  h.set("Content-Type", tipo);
  h.set("Content-Disposition", dispArquivo(nome, inline && podeAbrir ? "inline" : "attachment"));
  // ⚠ Sem `nosniff` o navegador pode adivinhar HTML num arquivo declarado de outro jeito, e a
  // lista acima perderia o sentido pela porta dos fundos.
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Cache-Control", "private, no-store");
  return h;
}
