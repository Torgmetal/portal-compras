// ─── VARRER UMA PASTA DO SHAREPOINT SEM USAR A BUSCA ─────────────────────────
//
// ⚠⚠ O `search` DO GRAPH DEVOLVE HTTP 500 NESTE DRIVE DESDE 22–23/09/2026, e escopar em pasta
// (`root:/caminho:/search`) falha igual. Medido em 26/09 com o mesmo token, nos mesmos segundos:
// a busca dava 500 em `/Comercial/1. Orçamento` e na `2.5.2 Fabricação` da OP-105 e da OP-103,
// enquanto `children` por caminho respondia 200 em ~100 ms. É o índice do SharePoint que adoeceu —
// não há o que consertar do nosso lado, só parar de depender dele.
//
// Este módulo é a alternativa: listar por caminho. Ver `docs/memoria-claude/torg_graph_busca_500.md`
// para o levantamento completo (seis pontos dependiam da busca, e só o cron do LQC avisava).
//
// ⚠⚠ LISTAGEM PARCIAL NÃO VALE — a mesma lição de `lib/cmr-localizar.js`. Pasta que falha derruba
// a varredura inteira: engolir o erro faria "a marca não tem desenho" e "o SharePoint não
// respondeu" saírem iguais na tela, e quem está no PCP não tem como distinguir os dois.
//
// ⚠⚠ E A COTA DO GRAPH É COMPARTILHADA POR TODOS OS CRONS. Uma varredura de ~2.500 pastas com
// paralelismo 8–10 estourou o limite do tenant (`429 activityLimitReached`) e perdeu ~1.370
// respostas no meio. Com paralelismo 3 e uma pausa entre lotes, 651 chamadas passaram sem um
// único 429. O número abaixo é medido, não estimado — quem for mexer, meça de novo.
import "server-only";
import { getAccessToken } from "./sharepoint";

const GRAPH = "https://graph.microsoft.com/v1.0";

export const PARALELO = 3;
export const PAUSA_MS = 80;
/** Teto de QUANTIDADE de pastas — profundidade não é limitada de propósito (ver abaixo). */
export const TETO_PASTAS = 2000;

const STATUS_TRANSITORIO = new Set([429, 503]);
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET autenticado no Graph que espera o `Retry-After` em vez de desistir.
 * @param {string} token
 * @returns {(url: string) => Promise<Response>}
 */
export function getDoGraph(token, { tentativas = 5, tetoEsperaS = 60 } = {}) {
  return async function get(url, tent = 0) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (STATUS_TRANSITORIO.has(r.status) && tent < tentativas) {
      const esperaS = Math.min(Number(r.headers.get("retry-after") || 10) || 10, tetoEsperaS);
      await dorme(esperaS * 1000);
      return get(url, tent + 1);
    }
    return r;
  };
}

/** Erro do Graph em uma linha — sem corpo bruto, sem token, sem URL de download. */
export async function motivoDoGraph(resp) {
  let code = "", message = "";
  try {
    const j = await resp.json();
    code = j?.error?.code || "";
    message = String(j?.error?.message || "").slice(0, 120);
  } catch { /* corpo não-JSON: fica só o status */ }
  return [`HTTP ${resp.status}`, code, message].filter(Boolean).join(" · ");
}

/**
 * Os filhos de UMA pasta, paginados até o fim.
 * @returns {Promise<Array|null>} `null` quando a pasta não existe (404). Qualquer outro erro lança.
 */
export async function listarPasta(get, driveId, caminho) {
  const itens = [];
  let url = `${GRAPH}/drives/${driveId}/root:${encodeURI(caminho)}:/children`
    + "?$select=id,name,file,folder,size,lastModifiedDateTime&$top=999";
  while (url) {
    const r = await get(url);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`listar "${caminho}": ${await motivoDoGraph(r)}`);
    const d = await r.json();
    itens.push(...(d.value || []));
    // ⚠ `$top` NÃO garante que veio tudo: pasta grande vem em páginas, e parar na primeira
    // devolveria meia pasta com cara de pasta inteira.
    url = d["@odata.nextLink"] || null;
  }
  return itens;
}

/**
 * Todos os arquivos sob uma pasta, a árvore INTEIRA.
 *
 * ⚠⚠ SEM LIMITE DE PROFUNDIDADE, de propósito. O `2.5.2 Fabricação` da OP-105 tem PDF no 5º nível
 * e o da OP-103 tem no 5º também, com nomes de pasta que ninguém previu (`CH 12.5`,
 * `70987833 - OK/CONJUNTOS/71053465 - OK`). Um `maxDepth` cortaria desenho de verdade sem dizer
 * nada. O teto é de QUANTIDADE de pastas, e estourá-lo é erro — nunca "o que deu para ver".
 *
 * @param {(url: string) => Promise<Response>} get GET autenticado (use `getDoGraph`)
 * @param {string} driveId
 * @param {string} raiz caminho absoluto no drive
 * @param {object} [opts]
 * @param {(nome: string) => boolean} [opts.arquivo] filtro por nome de arquivo (default: todos)
 * @returns {Promise<{arquivos: Array<{id,name,size,modificadoEm,caminho,pasta,relativo}>, pastas: number}|null>}
 *          `null` quando a RAIZ não existe. Qualquer outra falha lança.
 */
export async function varrerArvore(get, driveId, raiz, opts = {}) {
  const { arquivo = () => true, teto = TETO_PASTAS, paralelo = PARALELO, pausaMs = PAUSA_MS } = opts;
  const base = String(raiz).replace(/\/+$/, "");
  const arquivos = [];

  // ⚠ A RAIZ É LISTADA À PARTE porque só ela distingue "não existe" de "está vazia". Raiz 404 é
  // resposta legítima (OP sem pasta de fabricação); subpasta que some no meio da varredura é
  // corrida normal e se ignora.
  const naRaiz = await listarPasta(get, driveId, base);
  if (naRaiz === null) return null;

  let visitadas = 1;
  const colher = (caminho, itens, proximo) => {
    for (const it of itens) {
      if (it.folder) proximo.push(`${caminho}/${it.name}`);
      else if (it.file && arquivo(it.name || "")) {
        arquivos.push({
          id: it.id,
          name: it.name,
          size: it.size || 0,
          modificadoEm: it.lastModifiedDateTime || null,
          caminho,
          pasta: caminho.slice(caminho.lastIndexOf("/") + 1),
          relativo: caminho.slice(base.length).replace(/^\//, ""),
        });
      }
    }
  };

  let nivel = [];
  colher(base, naRaiz, nivel);

  while (nivel.length) {
    visitadas += nivel.length;
    if (visitadas > teto) {
      throw new Error(`varrer "${base}": mais de ${teto} pastas — recusado em vez de escolher pelo que deu para ver`);
    }
    const proximo = [];
    for (let i = 0; i < nivel.length; i += paralelo) {
      const lote = nivel.slice(i, i + paralelo);
      // ⚠ `Promise.all` rejeita na primeira falha — é assim que "nunca parcial" se mantém de pé.
      const listas = await Promise.all(lote.map((c) => listarPasta(get, driveId, c)));
      lote.forEach((caminho, k) => {
        if (listas[k] === null) return;
        colher(caminho, listas[k], proximo);
      });
      if (pausaMs) await dorme(pausaMs);
    }
    nivel = proximo;
  }
  return { arquivos, pastas: visitadas };
}

/** Atalho: `varrerArvore` com um GET já autenticado pelo token do app. */
export async function varrerPasta(driveId, raiz, opts = {}) {
  return varrerArvore(getDoGraph(await getAccessToken()), driveId, raiz, opts);
}
