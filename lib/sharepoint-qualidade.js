import "server-only";
import { ensureFolder, uploadFileToFolder } from "./sharepoint";
import { assertBlobUrlSegura } from "./blob-url";

// Pasta de backup ISO dos documentos da Qualidade no SharePoint (configurável).
// ⚠️ Confirmar o caminho com o Vitor antes do uso real (pode ser ajustado via env).
export const QUALIDADE_DOCS_FOLDER =
  process.env.SHAREPOINT_QUALIDADE_DOCS_FOLDER || "/Qualidade/Workspace/Documentos";

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
  const { webUrl } = await uploadFileToFolder({
    folderPath: QUALIDADE_DOCS_FOLDER,
    fileName,
    buffer,
    contentType: arquivoTipo || "application/octet-stream",
  });
  return webUrl;
}
