import "server-only";

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function getMesAtualFolder(date = new Date()) {
  const idx = date.getMonth(); // 0..11
  return `${idx + 1}. ${MESES_PT[idx]}`;
}

export function getMesNomePt(date = new Date()) {
  return MESES_PT[date.getMonth()];
}

function env(name, fallback) {
  const v = process.env[name];
  if (!v && fallback === undefined) {
    throw new Error(`Variavel de ambiente ${name} nao configurada`);
  }
  return v || fallback;
}

// Token cache em memoria (Azure AD tokens validos por ~1h)
let tokenCache = { value: null, expiresAt: 0 };

export async function getAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.value;
  }
  const tenant = env("AZURE_TENANT_ID");
  const clientId = env("AZURE_CLIENT_ID");
  const clientSecret = env("AZURE_CLIENT_SECRET");

  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error("Falha ao autenticar com Azure: " + (data.error_description || JSON.stringify(data).slice(0, 200)));
  }
  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

// Baixa um arquivo do drive do SharePoint por path relativo a raiz do drive.
// Ex: pcpFolderBase = "/PCP/6. Planejamento de Produção/6.2 Programação Mensal de Produção"
//     mesFolder    = "5. Maio"
//     fileName     = "1. Planilha de Gestão.xlsx"
export async function downloadFileByPath({ driveId, fullPath }) {
  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:${encodeURI(fullPath)}:/content`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "follow",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao baixar ${fullPath}: HTTP ${res.status} ${txt.slice(0, 300)}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

// Descobre o caminho do arquivo de producao pra um mes especifico.
// Retorna varios candidatos (xlsx, xlsm) pra tentar em sequencia.
export function getPlanilhaProducaoCandidates(date = new Date()) {
  const base = env("SHAREPOINT_PCP_BASE_FOLDER", "/PCP/6. Planejamento de Produção/6.2 Programação Mensal de Produção");
  const file = env("SHAREPOINT_PCP_FILE_NAME", "1. Planilha de Gestão.xlsx");
  const folder = `${base}/${getMesAtualFolder(date)}`;
  const semExt = file.replace(/\.(xlsx|xlsm|xls)$/i, "");
  return [
    `${folder}/${file}`,                   // tenta o nome exato primeiro
    `${folder}/${semExt}.xlsx`,            // fallback xlsx
    `${folder}/${semExt}.xlsm`,            // fallback xlsm (macros)
  ].filter((v, i, a) => a.indexOf(v) === i); // dedup
}

export async function downloadPlanilhaProducao(date = new Date()) {
  const driveId = env("SHAREPOINT_DRIVE_ID");
  const candidates = getPlanilhaProducaoCandidates(date);
  const erros = [];
  for (const fullPath of candidates) {
    try {
      const buffer = await downloadFileByPath({ driveId, fullPath });
      return { buffer, path: fullPath };
    } catch (e) {
      erros.push(`${fullPath.split("/").pop()}: ${e.message.slice(0, 80)}`);
    }
  }
  throw new Error(`Nenhum dos candidatos foi encontrado. Tentei: ${erros.join(" | ")}`);
}

// ─── SHAREPOINT FOLDER BROWSING (usado pelo Comercial) ─────────────────

/**
 * Extrai o path relativo ao drive a partir de uma URL do SharePoint.
 * Suporta dois formatos:
 *   1. URL direta: https://{tenant}.sharepoint.com/sites/{site}/{library}/{path...}
 *   2. URL de view: https://{tenant}.sharepoint.com/sites/{site}/{library}/Forms/AllItems.aspx?id={encodedPath}
 * O {library} é a raiz do drive, entao retornamos apenas o {path} apos o library name.
 */
export function parseSharePointUrl(sharepointUrl) {
  try {
    const url = new URL(sharepointUrl);

    // Formato 2: URL de view com ?id= contendo o path real
    const idParam = url.searchParams.get("id");
    if (idParam) {
      const fullPath = decodeURIComponent(idParam);
      // /sites/{siteName}/{libraryName}/{rest...}
      const match = fullPath.match(/\/sites\/[^/]+\/([^/]+)\/(.*)/);
      if (match) return "/" + match[2];
    }

    // Formato 1: URL direta (pathname contem o path)
    const path = decodeURIComponent(url.pathname);
    // Ignorar sufixos de view como /Forms/AllItems.aspx
    const cleanPath = path.replace(/\/Forms\/[^/]+\.aspx$/, "");
    const match = cleanPath.match(/\/sites\/[^/]+\/([^/]+)\/(.*)/);
    if (!match) throw new Error("Formato de URL nao reconhecido");
    return "/" + match[2];
  } catch (e) {
    if (e.message?.startsWith("URL do SharePoint")) throw e;
    throw new Error("URL do SharePoint invalida: " + e.message);
  }
}

/**
 * Lista os itens filhos de uma pasta no SharePoint.
 */
export async function listFolderChildren(driveId, folderPath) {
  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:${encodeURI(folderPath)}:/children?$top=200&$select=id,name,size,file,folder,lastModifiedDateTime`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha ao listar pasta ${folderPath}: HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.value || [];
}

/**
 * Lista TODOS os arquivos recursivamente a partir de uma pasta.
 * @param {string} driveId
 * @param {string} folderPath - caminho relativo ao drive root
 * @param {object} opts
 * @param {number} opts.maxDepth - profundidade maxima (default 5)
 * @param {string[]} opts.supportedTypes - extensoes permitidas (null = todas)
 * @returns {Promise<Array<{id, name, size, type, mimeType, folder, folderPath, lastModified}>>}
 */
export async function listAllFilesRecursive(driveId, folderPath, opts = {}) {
  const { maxDepth = 5, supportedTypes = null } = opts;
  const result = [];

  async function crawl(path, depth, folderName) {
    if (depth > maxDepth) return;
    let items;
    try {
      items = await listFolderChildren(driveId, path);
    } catch {
      return; // pula pastas que falharem
    }
    for (const item of items) {
      if (item.folder) {
        await crawl(`${path}/${item.name}`, depth + 1, item.name);
      } else if (item.file) {
        const ext = item.name.split(".").pop()?.toLowerCase();
        if (!supportedTypes || supportedTypes.includes(ext)) {
          result.push({
            id: item.id,
            name: item.name,
            size: item.size || 0,
            type: ext,
            mimeType: item.file?.mimeType,
            folder: folderName,
            folderPath: path,
            lastModified: item.lastModifiedDateTime,
          });
        }
      }
    }
  }

  const rootName = folderPath.split("/").filter(Boolean).pop() || "Raiz";
  await crawl(folderPath, 0, rootName);
  return result;
}

/**
 * Baixa um arquivo pelo ID do item no drive.
 * Retorna { buffer, contentType }.
 */
export async function downloadFileById(driveId, itemId) {
  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Falha ao baixar item ${itemId}: HTTP ${res.status}`);
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
}
