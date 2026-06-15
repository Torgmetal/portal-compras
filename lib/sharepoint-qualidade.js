import "server-only";
import { ensureFolder, uploadFileToFolder, getAccessToken } from "./sharepoint";
import { assertBlobUrlSegura } from "./blob-url";

const GRAPH = "https://graph.microsoft.com/v1.0";

// Pasta de backup ISO dos documentos da Qualidade no SharePoint (configurável).
// ⚠️ Confirmar o caminho com o Vitor antes do uso real (pode ser ajustado via env).
export const QUALIDADE_DOCS_FOLDER =
  process.env.SHAREPOINT_QUALIDADE_DOCS_FOLDER || "/Qualidade/Workspace/Documentos";

// Para onde vão os documentos VENCIDOS ao serem excluídos (controle ISO de
// obsoletos — o arquivo não some, fica segregado).
export const QUALIDADE_OBSOLETO_FOLDER =
  process.env.SHAREPOINT_QUALIDADE_OBSOLETO_FOLDER || `${QUALIDADE_DOCS_FOLDER}/Obsoleto`;

// O ensureFolder base só cria a pasta-folha (assume o pai existente). Como a
// estrutura /Qualidade/Workspace ainda não existe, criamos a cadeia inteira.
async function ensureFolderChain(path) {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur += "/" + p;
    await ensureFolder(cur);
  }
}

/**
 * Backup ISO de um documento da Qualidade no SharePoint. Baixa o arquivo do Blob
 * e sobe para a pasta de documentos, com nome prefixado pelo vínculo/categoria e
 * tipo. Retorna o webUrl da cópia. LANÇA em erro (o chamador registra OK/ERRO).
 */
export async function backupDocumentoQualidade({ arquivoUrl, arquivoNome, arquivoTipo, vinculo, categoria, tipo }) {
  assertBlobUrlSegura(arquivoUrl);
  const res = await fetch(arquivoUrl);
  if (!res.ok) throw new Error(`Falha ao baixar do Blob: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await ensureFolderChain(QUALIDADE_DOCS_FOLDER);
  const prefixo = (vinculo || categoria || "QUALIDADE").toUpperCase().trim();
  const fileName = `${prefixo}${tipo ? ` - ${tipo}` : ""} - ${arquivoNome || "documento"}`.slice(0, 200);
  const { webUrl, id } = await uploadFileToFolder({
    folderPath: QUALIDADE_DOCS_FOLDER,
    fileName,
    buffer,
    contentType: arquivoTipo || "application/octet-stream",
  });
  return { webUrl, id };
}

// Move o arquivo (por item id) para a pasta de Obsoletos. Cria a pasta se faltar.
// Retorna o novo webUrl. LANÇA em erro (o chamador trata best-effort).
export async function moverParaObsoleto(itemId) {
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  if (!driveId) throw new Error("SHAREPOINT_DRIVE_ID não configurado");
  await ensureFolderChain(QUALIDADE_OBSOLETO_FOLDER);
  const token = await getAccessToken();
  // id da pasta destino
  const fRes = await fetch(`${GRAPH}/drives/${driveId}/root:${encodeURI(QUALIDADE_OBSOLETO_FOLDER)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const folder = await fRes.json();
  if (!fRes.ok) throw new Error(`Pasta Obsoleto: HTTP ${fRes.status} ${(folder?.error?.message || "").slice(0, 120)}`);
  // move (PATCH parentReference)
  const mRes = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ parentReference: { id: folder.id } }),
  });
  const moved = await mRes.json();
  if (!mRes.ok) throw new Error(`Mover p/ Obsoleto: HTTP ${mRes.status} ${(moved?.error?.message || "").slice(0, 120)}`);
  return moved.webUrl || null;
}
