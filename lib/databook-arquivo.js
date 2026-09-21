import "server-only";
import { downloadRhItem, downloadFileById, downloadSharedFile, procurarArquivoPorNome } from "./sharepoint";
import { prisma } from "./prisma";
import { resolveServidorDriveId } from "./projetos-databook";
import { isBlobUrlSegura } from "./blob-url";
import { pdfDoRelatorio, fonteDeInspecao } from "./relatorio-pdf-fonte";

// ─── DE ONDE VEM O BYTE DE UM ANEXO DO DATA BOOK ──────────────────────────────
// Cada porta de entrada grava o documento de um jeito, e escolher errado dá 403 —
// silenciosamente, porque o gerador engolia a falha. Foi o que aconteceu com a
// OP-067: os 1.336 desenhos da §02 entraram pelo navegador do servidor, que grava
// `arquivoUrl` com a webUrl do SharePoint (um LINK DE PÁGINA, não o arquivo). Um
// fetch nessa URL devolve 403 sempre. (22/08/2026)
//
//   origem                        onde está                       como baixa
//   ────────────────────────────  ─────────────────────────────  ─────────────────
//   anexo_databook                Vercel Blob                     fetch(arquivoUrl)
//   servidor / projeto_servidor   biblioteca SERVIDOR             itemId no drive SERVIDOR
//   importacao_servidor / demais  biblioteca padrão               itemId no drive padrão
//
// A regra prática: URL do SharePoint NÃO se baixa por fetch — se há itemId, é ele
// que manda.
const SUFIXOS_SHAREPOINT = [".sharepoint.com", ".sharepoint-df.com"];

/**
 * A URL aponta para o SharePoint (link de PÁGINA, não arquivo baixável por fetch)?
 *
 * ⚠⚠ ANALISADA COM `new URL`, NÃO POR REGEX DE SUBSTRING (parecer do Codex, 15/09/2026). A regex
 * `/sharepoint\.com/` casava `https://sharepoint.com.exemplo-malicioso.br/x` e casava até quando o
 * texto aparecia só na QUERY. Aqui o que vale é o hostname, e o ponto no sufixo é o que impede
 * `evil-sharepoint.com` de passar. Exige https e recusa credenciais embutidas na URL.
 *
 * Medido no acervo (15/09/2026): 4.200 URLs do SharePoint, TODAS em
 * `torgmetal637.sharepoint.com` e todas https — nada legítimo é recusado por este aperto.
 */
export function ehUrlSharePoint(url) {
  let u;
  try { u = new URL(String(url || "")); } catch { return false; }
  // ⚠ Porta explícita é recusada (apontado pelo Codex): `…sharepoint.com:8443` passava pela
  // checagem de hostname e apontaria para um serviço que não é o SharePoint.
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return SUFIXOS_SHAREPOINT.some((sufixo) => host.endsWith(sufixo));
}

/** O caminho do arquivo no SharePoint, venha do campo que vier. */
const caminhoSharePoint = (doc) => [doc.sharepointUrl, doc.arquivoUrl].find((x) => ehUrlSharePoint(x)) || null;
const NO_SERVIDOR = new Set(["servidor", "projeto_servidor"]);

export function precisaDriveServidor(docs) {
  return docs.some((d) => NO_SERVIDOR.has(d.origem) || (!d.arquivoUrl && d.sharepointItemId) || ehUrlSharePoint(d.arquivoUrl));
}

export async function resolverDriveServidor(docs) {
  return precisaDriveServidor(docs) ? await resolveServidorDriveId() : null;
}

export async function baixarDocumento(doc, servidorDriveId = null) {
  const url = doc.arquivoUrl || "";

  // ⚠⚠ O RELATÓRIO DE INSPEÇÃO SE MONTA AQUI DENTRO, NÃO SE BAIXA. O `arquivoUrl` dele aponta para
  // a rota do próprio portal que renderiza o PDF — e um `fetch` nela, daqui, não tem cookie: a
  // rota exige sessão e devolve 401. Pior: a URL guarda o host de QUEM GRAVOU, e havia documento
  // de produção com `http://localhost:3000` (fechado por quem rodava em dev, que escreve no banco
  // de produção) — no servidor da Vercel esse fetch nem sai da função. Nos dois casos o anexo caía
  // fora do livro em silêncio, que é o defeito que esta lib inteira existe para não repetir.
  // ⚠ Pela ORIGEM e pela OBRA do documento, não só pela URL — ver `fonteDeInspecao`. Esta lib
  // alimenta também o portal do CLIENTE, onde servir o relatório de outra obra seria vazamento
  // entre clientes, não deselegância interna.
  const insp = fonteDeInspecao(doc);
  if (insp) return (await pdfDoRelatorio(insp.relatorioId, { revisao: insp.revisao, exigirOp: insp.exigirOp })).bytes;

  // ⚠⚠ `fetch` POR URL SÓ PARA O BLOB — E ISSO É SSRF, NÃO ZELO (achado ALTA do Codex,
  // 15/09/2026). A condição era "não é do SharePoint → busca", ou seja, QUALQUER endereço que
  // coubesse no campo era buscado pelo servidor e devolvido a quem pediu: `169.254.169.254`
  // (metadados da nuvem), `localhost`, a rede interna. Pior, isto aqui alimenta também o PORTAL DO
  // CLIENTE, que é acesso por token, sem login.
  //
  // ⚠ Eu tinha escrito no commit anterior que "a defesa de SSRF continua inteira" porque a ROTA
  // filtra antes. Não continuava: bastava o documento ter `sharepointItemId` para a rota liberar a
  // entrada, e aqui dentro a URL arbitrária era buscada ANTES de o itemId ser sequer tentado. A
  // guarda tem de estar onde o `fetch` está.
  //
  // Medido antes de fechar: dos 3.431 documentos ativos com `arquivoUrl`, 381 são Blob, 3.048 são
  // SharePoint e OUTROS 2 — os dois relatórios de inspeção, que já saem por `fonteDeInspecao` lá
  // em cima. Nada legítimo depende do fetch aberto.
  if (isBlobUrlSegura(url)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }

  // ⚠ Sem itemId, o CAMINHO ainda pode salvar: antes isto desistia aqui, mesmo com a pasta e o
  // nome do arquivo gravados ao lado (apontado pelo Codex).
  if (!doc.sharepointItemId) {
    const so = caminhoSharePoint(doc);
    if (so) return (await downloadSharedFile(so)).buffer;
    throw new Error("documento sem arquivo (nem blob nem item do SharePoint)");
  }

  // ⚠ tenta o drive provável e, se falhar, o outro: há documento antigo com `origem`
  // que não corresponde à biblioteca onde o arquivo realmente está, e perder o anexo
  // por causa do rótulo seria absurdo.
  const primeiro = NO_SERVIDOR.has(doc.origem) ? "servidor" : "padrao";
  const tentar = async (qual) => {
    if (qual === "servidor") {
      const id = servidorDriveId || (await resolveServidorDriveId());
      if (!id) throw new Error("drive SERVIDOR não resolvido");
      return (await downloadFileById(id, doc.sharepointItemId)).buffer;
    }
    return (await downloadRhItem(doc.sharepointItemId)).buffer;
  };

  try {
    return await tentar(primeiro);
  } catch (e) {
    try {
      return await tentar(primeiro === "servidor" ? "padrao" : "servidor");
    } catch { /* última tentativa abaixo */ }
    // ⚠⚠ ÚLTIMO RECURSO: o itemId morre quando alguém move ou renomeia o arquivo no SharePoint, e
    // aí o certificado some do data book por um motivo administrativo. O CAMINHO sobrevive a isso.
    //
    // ⚠ E o caminho pode estar em QUALQUER um dos dois campos. Só `sharepointUrl` era consultado —
    // mas o documento importado da planilha do CMR guarda o caminho em `arquivoUrl`, e por isso o
    // socorro nunca disparava para ele. Foi o caso do certificado do arame da OP-106 (Vitor,
    // 28/08/2026: "não está trazendo o certificado do arame"): itemId devolvia 404 e o PDF do
    // certificado, que baixa pelo caminho em 309 KB, ficava de fora do livro.
    const caminho = caminhoSharePoint(doc);
    if (caminho) {
      try { return (await downloadSharedFile(caminho)).buffer; } catch { /* segue */ }
    }
    // ⚠⚠ 4º DEGRAU: o arquivo foi MOVIDO DE PASTA — aí id e caminho morrem juntos. Foi o caso dos
    // certificados R 261162 e R 261163 da OP-106 (16/09/2026): o Almoxarifado levou os PDFs de
    // "Certificados TMSA" para "Certificados 2026/Certificados Digitalizados", o CMR importado
    // ainda apontava para o lugar antigo, e o data book saiu SEM os dois — a pendência ficou num
    // canto da tela e o cliente aceitou o livro incompleto. O NOME do certificado é estável
    // ("R 261163.pdf"), então procura por ele a partir da pasta-raiz do caminho antigo; achando
    // UM só, baixa e grava o endereço novo, para a próxima geração não procurar de novo.
    const movido = await baixarMovido(doc, caminho, servidorDriveId).catch(() => null);
    if (movido) return movido;
    throw e; // o erro que interessa é o da biblioteca esperada
  }
}

/** Caminho dentro da biblioteca SERVIDOR ("/Almoxarifado/01. Rastreabilidade/…/R 261163.pdf"), ou null. */
function caminhoNoServidor(url) {
  try {
    const p = decodeURIComponent(new URL(url).pathname);
    const i = p.indexOf("/SERVIDOR/");
    return i >= 0 ? p.slice(i + "/SERVIDOR".length) : null;
  } catch { return null; }
}

async function baixarMovido(doc, caminho, servidorDriveId) {
  const rel = caminhoNoServidor(caminho);
  const partes = (rel || "").split("/").filter(Boolean);
  if (partes.length < 2) return null;
  const nome = partes[partes.length - 1];
  // procura a partir do 2º nível ("/Almoxarifado/01. Rastreabilidade"): amplo o bastante para
  // achar o arquivo que mudou de subpasta, estreito o bastante para não pegar homônimo de outro setor
  const raiz = "/" + partes.slice(0, Math.min(2, partes.length - 1)).join("/");
  const driveId = servidorDriveId || (await resolveServidorDriveId());
  if (!driveId) return null;
  const achados = await procurarArquivoPorNome(driveId, raiz, nome);
  if (achados.length !== 1) return null; // dois com o mesmo nome: não adivinha qual é
  const { buffer } = await downloadFileById(driveId, achados[0].id);
  if (doc.id) {
    await prisma.documentoQualidade
      .update({ where: { id: doc.id }, data: { sharepointItemId: achados[0].id, ...(achados[0].webUrl ? { arquivoUrl: achados[0].webUrl } : {}) } })
      .catch(() => { /* o anexo já está no livro; o endereço novo é conveniência */ });
  }
  return buffer;
}
