import "server-only";
import { downloadRhItem, downloadFileById, downloadSharedFile } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";

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
const NO_SERVIDOR = new Set(["servidor", "projeto_servidor"]);

export function precisaDriveServidor(docs) {
  return docs.some((d) => NO_SERVIDOR.has(d.origem) || (!d.arquivoUrl && d.sharepointItemId) || EH_SHAREPOINT.test(d.arquivoUrl || ""));
}

export async function resolverDriveServidor(docs) {
  return precisaDriveServidor(docs) ? await resolveServidorDriveId() : null;
}

export async function baixarDocumento(doc, servidorDriveId = null) {
  const url = doc.arquivoUrl || "";
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
    // ⚠ ÚLTIMO RECURSO: o itemId morre quando alguém move ou renomeia o arquivo no
    // SharePoint, e aí o certificado some do data book por um motivo administrativo.
    // A `sharepointUrl` é o caminho, e caminho sobrevive a mudança de id.
    if (doc.sharepointUrl && EH_SHAREPOINT.test(doc.sharepointUrl)) {
      try { return (await downloadSharedFile(doc.sharepointUrl)).buffer; } catch { /* segue */ }
    }
    throw e; // o erro que interessa é o da biblioteca esperada
  }
}
