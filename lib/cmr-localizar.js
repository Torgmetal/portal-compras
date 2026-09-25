// ─── ONDE ESTÁ A PLANILHA CMR DO ANO ─────────────────────────────────────────
//
// ⚠⚠ A BUSCA DO GRAPH PAROU E LEVOU TRÊS CRONS JUNTO (25/09/2026). `root/search(q=...)` passou a
// devolver HTTP 500 entre 22 e 23/09: cmr-sincronizar, cmr-reconciliar e lqc-sharepoint, todos
// "SharePoint busca HTTP 500". No MESMO drive e com o MESMO token, o que lista pasta por caminho
// seguiu funcionando (casar-certificados percorre `/Almoxarifado/01. Rastreabilidade` todo dia).
// A busca é um índice do SharePoint — quando ele adoece, não há nada do nosso lado para consertar.
//
// Por isso a planilha é achada LISTANDO a pasta da rastreabilidade; a busca virou reserva.
//
// ⚠⚠ LISTAGEM PARCIAL NÃO VALE (achado do Codex). `listAllFilesRecursive` engole o erro de uma
// subpasta e segue: numa falha da pasta onde está a planilha atual, ele escolheria uma cópia
// velha — e as escritas do CMR iriam para o arquivo errado sem erro nenhum. Aqui qualquer pasta
// que falhe derruba a listagem inteira, e cada pasta é PAGINADA (`@odata.nextLink`): `$top` não
// garante que veio tudo.
//
// ⚠ O nome muda ("CMR TORG-2026.xlsx" → "CMR TORG-2026-Almoxarifado01.xlsx"), então vale a regra
// de sempre (Vitor, 18/08): nome contém "CMR TORG-{ano}", a da rastreabilidade primeiro, a
// modificada mais recentemente. "~$" é o arquivo de trava do Excel aberto, não a planilha.

const GRAPH = "https://graph.microsoft.com/v1.0";
export const PASTA_CMR = () => process.env.SHAREPOINT_CMR_FOLDER_PATH || "/Almoxarifado/01. Rastreabilidade";
const PROFUNDIDADE = 2;

/**
 * Entre arquivos já normalizados, a planilha CMR do ano (puro).
 * @param {Array<{id, name, modificadoEm, caminho}>} arquivos
 * @returns {object|null}
 */
export function escolherCmr(arquivos, ano) {
  const alvo = `CMR TORG-${ano}`;
  const candidatos = (arquivos || []).filter((a) => /\.xlsx?$/i.test(a.name || "")
    && !/^~\$/.test(a.name) && String(a.name).toUpperCase().includes(alvo));
  const naPasta = candidatos.filter((a) => /rastreabilidade/i.test(a.caminho || ""));
  const lista = (naPasta.length ? naPasta : candidatos)
    .slice().sort((a, b) => new Date(b.modificadoEm || 0) - new Date(a.modificadoEm || 0));
  return lista[0] || null;
}

/** Corpo de erro do Graph em uma linha curta — sem corpo bruto, token nem URL de download. */
export async function motivoDoGraph(resp) {
  let code = "", message = "";
  try {
    const j = await resp.json();
    code = j?.error?.code || "";
    message = String(j?.error?.message || "").slice(0, 120);
  } catch { /* corpo não-JSON: fica só o status */ }
  const req = resp.headers?.get?.("request-id") || "";
  return [`HTTP ${resp.status}`, code, message, req && `request-id ${req}`].filter(Boolean).join(" · ");
}

async function listarPasta(get, driveId, caminho) {
  const itens = [];
  let url = `${GRAPH}/drives/${driveId}/root:${encodeURI(caminho)}:/children?$select=id,name,file,folder,lastModifiedDateTime&$top=200`;
  while (url) {
    const r = await get(url);
    if (!r.ok) throw new Error(`listar "${caminho}": ${await motivoDoGraph(r)}`);
    const d = await r.json();
    itens.push(...(d.value || []));
    url = d["@odata.nextLink"] || null;
  }
  return itens;
}

/** Todas as planilhas sob a pasta, até `PROFUNDIDADE`. Qualquer pasta que falhe → lança. */
export async function listarPlanilhas(get, driveId, raiz, profundidade = PROFUNDIDADE) {
  const out = [];
  const visitar = async (caminho, nivel) => {
    for (const it of await listarPasta(get, driveId, caminho)) {
      if (it.folder && nivel < profundidade) await visitar(`${caminho}/${it.name}`, nivel + 1);
      else if (it.file && /\.xlsx?$/i.test(it.name)) {
        out.push({ id: it.id, name: it.name, modificadoEm: it.lastModifiedDateTime, caminho });
      }
    }
  };
  await visitar(raiz, 0);
  return out;
}

async function pelaBusca(get, driveId, ano) {
  const s = await get(`${GRAPH}/drives/${driveId}/root/search(q='${encodeURIComponent(`CMR TORG-${ano}`)}')?$select=id,name&$top=20`);
  if (!s.ok) throw new Error(`SharePoint busca ${await motivoDoGraph(s)}`);
  const achados = ((await s.json()).value || []).filter((x) => String(x.name || "").toUpperCase().includes(`CMR TORG-${ano}`));
  const det = [];
  for (const a of achados) {
    const r = await get(`${GRAPH}/drives/${driveId}/items/${a.id}?$select=id,name,parentReference,lastModifiedDateTime`);
    if (r.ok) {
      const d = await r.json();
      det.push({ id: d.id || a.id, name: d.name || a.name, modificadoEm: d.lastModifiedDateTime, caminho: decodeURIComponent(d.parentReference?.path || "") });
    }
  }
  return det;
}

/**
 * A planilha CMR do ano: pasta da rastreabilidade primeiro, busca do Graph como reserva.
 * @param {(url: string) => Promise<Response>} get GET autenticado (quem chama mantém as próprias retentativas)
 * @returns {Promise<{id, name, modificadoEm, caminho, origem: "pasta"|"busca"}>}
 */
export async function localizarCmr({ ano, driveId, get }) {
  let erroPasta = null;
  try {
    const achado = escolherCmr(await listarPlanilhas(get, driveId, PASTA_CMR()), ano);
    if (achado) return { ...achado, origem: "pasta" };
  } catch (e) {
    erroPasta = e.message;
  }
  // ⚠ Só chega aqui com a pasta listada POR INTEIRO sem candidato, ou com a listagem falhada —
  // nunca com uma listagem parcial aproveitada.
  let det;
  try {
    det = await pelaBusca(get, driveId, ano);
  } catch (e) {
    throw new Error(erroPasta ? `${e.message} (e a pasta: ${erroPasta})` : e.message);
  }
  const achado = escolherCmr(det, ano);
  if (!achado) throw new Error(`Planilha "CMR TORG-${ano}" não encontrada no SharePoint.`);
  return { ...achado, origem: "busca" };
}
