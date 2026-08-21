import "server-only";
import { getAccessToken } from "@/lib/sharepoint";

// Leitura das caixas da Engenharia via Microsoft Graph (Mail). Reusa o app do
// portal (Torg Portal SharePoint) — permissão Mail.Read app-only, TRAVADA por
// ApplicationAccessPolicy só nas 6 caixas da engenharia. Doc: docs/agente-emails-engenharia.md
const GRAPH = "https://graph.microsoft.com/v1.0";

// Campos que trazemos de cada mensagem (metadados + snippet — sem corpo inteiro).
const SELECT = [
  "id", "subject", "bodyPreview", "from", "toRecipients", "ccRecipients",
  "receivedDateTime", "sentDateTime", "conversationId", "internetMessageId", "hasAttachments",
].join(",");

async function graphGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

/**
 * Lê o DELTA de uma pasta de uma caixa (só o que mudou desde o deltaLink anterior).
 * @param {string} caixa  endereço da caixa (ex.: engenharia@torg.com.br)
 * @param {string} pasta  well-known folder: "inbox" | "sentItems"
 * @param {string|null} deltaLink  link salvo da última sync (null = 1ª vez)
 * @returns {{ mensagens: object[], deltaLink: string|null }}
 */
export async function lerDeltaMensagens(caixa, pasta, deltaLink = null) {
  const token = await getAccessToken();
  let url = deltaLink
    || `${GRAPH}/users/${encodeURIComponent(caixa)}/mailFolders/${pasta}/messages/delta?$select=${SELECT}&$top=50`;

  const mensagens = [];
  let novoDeltaLink = null;
  // segue as páginas (nextLink) até chegar no deltaLink final
  for (let i = 0; i < 100; i++) {
    const data = await graphGet(url, token);
    for (const m of data.value || []) mensagens.push(m);
    if (data["@odata.nextLink"]) { url = data["@odata.nextLink"]; continue; }
    novoDeltaLink = data["@odata.deltaLink"] || null;
    break;
  }
  return { mensagens, deltaLink: novoDeltaLink };
}

/** Nomes/metadados dos anexos de uma mensagem (só p/ quem tem hasAttachments). */
export async function lerAnexos(caixa, mensagemId) {
  const token = await getAccessToken();
  const url = `${GRAPH}/users/${encodeURIComponent(caixa)}/messages/${mensagemId}/attachments?$select=name,contentType,size`;
  try {
    const data = await graphGet(url, token);
    return (data.value || []).map((a) => ({ nome: a.name || "", tipo: a.contentType || "", tamanho: a.size || 0 }));
  } catch {
    return []; // anexo é acessório — nunca aborta a ingestão
  }
}

/** Endereço + nome de um campo emailAddress do Graph. */
export function extrairEndereco(rec) {
  const e = rec?.emailAddress || {};
  return { endereco: (e.address || "").toLowerCase(), nome: e.name || null };
}
