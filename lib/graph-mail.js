import "server-only";
import { getAccessToken } from "@/lib/sharepoint";

// Leitura das caixas da Engenharia via Microsoft Graph (Mail). Reusa o app do
// portal (Torg Portal SharePoint) — permissão Mail.Read app-only, TRAVADA por
// ApplicationAccessPolicy só nas 6 caixas da engenharia. Doc: docs/agente-emails-engenharia.md
const GRAPH = "https://graph.microsoft.com/v1.0";

// Campos que trazemos de cada mensagem (metadados + snippet — sem corpo inteiro).
const SELECT = [
  "id", "subject", "bodyPreview", "from", "toRecipients", "ccRecipients",
  "receivedDateTime", "sentDateTime", "conversationId", "internetMessageId", "hasAttachments", "webLink",
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
 * Lê mensagens de uma pasta EM BLOCOS (delta query). Processa no máximo `maxPaginas`
 * por chamada e devolve a "ligação" pra retomar (nextLink no meio do histórico, ou o
 * deltaLink final quando acaba) — evita puxar anos de e-mail de uma vez (timeout).
 * A `ligacao` (nextLink OU deltaLink) é uma URL do Graph que a próxima rodada usa direto.
 * @returns {{ mensagens: object[], ligacao: string|null, concluido: boolean }}
 */
export async function lerDeltaMensagens(caixa, pasta, ligacaoAnterior = null, maxPaginas = 3) {
  const token = await getAccessToken();
  const urlInicial = `${GRAPH}/users/${encodeURIComponent(caixa)}/mailFolders/${pasta}/messages/delta?$select=${SELECT}&$top=50`;
  let url = ligacaoAnterior || urlInicial;

  const mensagens = [];
  let ligacao = null;
  let concluido = false;
  for (let i = 0; i < maxPaginas; i++) {
    let data;
    try {
      data = await graphGet(url, token);
    } catch (e) {
      // token de delta expirado/inválido (410 / resync) → reinicia do zero (o dedupe cobre)
      const resync = e.status === 410 || /resync|SyncStateNotFound|SyncStateInvalid|token/i.test(`${e.code} ${e.message}`);
      if (resync && url !== urlInicial) { url = urlInicial; data = await graphGet(url, token); }
      else throw e;
    }
    for (const m of data.value || []) mensagens.push(m);
    if (data["@odata.nextLink"]) { url = data["@odata.nextLink"]; ligacao = url; continue; } // ainda há histórico
    ligacao = data["@odata.deltaLink"] || null; // chegou ao fim → daqui é incremental
    concluido = true;
    break;
  }
  return { mensagens, ligacao, concluido };
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
