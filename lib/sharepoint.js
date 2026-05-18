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

// Descobre o caminho do arquivo de producao do mes corrente.
export function getPlanilhaProducaoPath(date = new Date()) {
  const base = env("SHAREPOINT_PCP_BASE_FOLDER", "/PCP/6. Planejamento de Produção/6.2 Programação Mensal de Produção");
  const file = env("SHAREPOINT_PCP_FILE_NAME", "1. Planilha de Gestão.xlsx");
  return `${base}/${getMesAtualFolder(date)}/${file}`;
}

export async function downloadPlanilhaProducao(date = new Date()) {
  const driveId = env("SHAREPOINT_DRIVE_ID");
  const fullPath = getPlanilhaProducaoPath(date);
  const buffer = await downloadFileByPath({ driveId, fullPath });
  return { buffer, path: fullPath };
}
