import "server-only";
import { downloadRhItem, downloadFileById, downloadSharedFile } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";
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
const EH_SHAREPOINT = /sharepoint\.com|sharepoint-df\.com/i;

/** A URL aponta para o SharePoint da empresa? (link de PÁGINA, não arquivo baixável por fetch) */
export const ehUrlSharePoint = (url) => EH_SHAREPOINT.test(String(url || ""));
const NO_SERVIDOR = new Set(["servidor", "projeto_servidor"]);

export function precisaDriveServidor(docs) {
  return docs.some((d) => NO_SERVIDOR.has(d.origem) || (!d.arquivoUrl && d.sharepointItemId) || EH_SHAREPOINT.test(d.arquivoUrl || ""));
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

  // arquivo de verdade (blob) — só quando não é link de página do SharePoint
  if (url && !EH_SHAREPOINT.test(url)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }

  if (!doc.sharepointItemId) throw new Error("documento sem arquivo (nem blob nem item do SharePoint)");

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
    const caminho = [doc.sharepointUrl, url].find((x) => x && EH_SHAREPOINT.test(x));
    if (caminho) {
      try { return (await downloadSharedFile(caminho)).buffer; } catch { /* segue */ }
    }
    throw e; // o erro que interessa é o da biblioteca esperada
  }
}
