import "server-only";
import { createHash } from "node:crypto";

// ─── AS FONTES OFICIAIS, BAIXADAS — E SÓ ISSO ────────────────────────────────
//
// Este arquivo NÃO parseia e NÃO grava: descobre a URL efetiva, baixa, confere o formato e devolve
// os bytes com o SHA-256. Separado de propósito — a evidência tem de existir ANTES de qualquer
// interpretação, e quem retoma uma importação interrompida precisa do artefato, não do download.

/**
 * ⚠⚠ A URL DO BRIEFING DEVOLVE 403, E ISSO NÃO É BLOQUEIO: É O PLONE. O gov.br serve o arquivo por
 * `/@@download/file`; o `.xlsx` "puro" é a PÁGINA do objeto, e o WAF recusa o acesso direto.
 * Medido em 22/09/2026: `.../tipi.xlsx` → 403; `.../tipi.xlsx/@@download/file` → 200, 673.645 bytes,
 * `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
 *
 * ⚠ As candidatas são tentadas em ordem e a primeira que responder XLSX vence — a Receita já mudou
 * o caminho antes, e fixar um endereço só é o que faz a sincronização morrer calada um dia.
 */
const TIPI_CANDIDATAS = [
  "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.xlsx/@@download/file",
  "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.xlsx",
];

const NCM_URL = "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";

/**
 * ⚠ Cabeçalho de navegador. Não é contornar proteção — é não se anunciar como robô: os dois
 * servidores recusam um `User-Agent` de biblioteca HTTP, e ambos são endpoints PÚBLICOS,
 * documentados, sem CAPTCHA e sem autenticação.
 */
const CABECALHOS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

/** XLSX começa com `PK\x03\x04` (é um zip). Tamanho mínimo evita aceitar página de erro. */
const MIN_BYTES = 50_000;
const MAX_BYTES = 80 * 1024 * 1024;

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function baixar(url, aceita) {
  const resp = await fetch(url, { headers: { ...CABECALHOS, Accept: aceita }, redirect: "follow" });
  if (!resp.ok) return { erro: `HTTP ${resp.status} em ${url}` };
  const buf = Buffer.from(await resp.arrayBuffer());
  return { buf, url: resp.url || url, contentType: resp.headers.get("content-type") || null };
}

/**
 * A TIPI, baixada e conferida como ARQUIVO — o conteúdo é problema do parser.
 *
 * ⚠⚠ VALIDAR O FORMATO ANTES DE GUARDAR. O gov.br responde 200 com HTML quando o caminho muda de
 * lugar: sem esta conferência, o portal guardaria uma página de erro como se fosse a TIPI, e o
 * SHA-256 dela viraria "a versão vigente".
 */
export async function baixarTipi() {
  const tentativas = [];
  for (const url of TIPI_CANDIDATAS) {
    const r = await baixar(url, "*/*");
    if (r.erro) { tentativas.push(r.erro); continue; }
    const ehZip = r.buf.length >= 4 && r.buf[0] === 0x50 && r.buf[1] === 0x4b && r.buf[2] === 0x03 && r.buf[3] === 0x04;
    if (!ehZip) { tentativas.push(`${url} devolveu ${r.buf.length} bytes que não são XLSX (provável HTML)`); continue; }
    if (r.buf.length < MIN_BYTES || r.buf.length > MAX_BYTES) { tentativas.push(`${url} devolveu ${r.buf.length} bytes — fora do tamanho plausível`); continue; }
    return { ok: true, fonte: "TIPI", url: r.url, bytes: r.buf.length, contentType: r.contentType, sha256: sha256(r.buf), conteudo: r.buf };
  }
  return { erro: `Nenhuma URL da TIPI devolveu um XLSX válido. ${tentativas.join(" | ")}` };
}

/**
 * A tabela NCM do Siscomex.
 *
 * ⚠ Ela é MELHOR que a TIPI num ponto: declara a própria vigência (`Data_Inicio`/`Data_Fim` por
 * código) e o ato que a fundamenta. Essa vigência é DELA — nunca é transferida para a alíquota
 * de IPI, que vem da TIPI e não declara nada disso.
 */
export async function baixarNcm() {
  const r = await baixar(NCM_URL, "application/json");
  if (r.erro) return { erro: r.erro };
  let dados;
  try { dados = JSON.parse(r.buf.toString("utf8")); } catch { return { erro: "O Siscomex não devolveu JSON (provável página de erro ou redirecionamento)." }; }
  if (!Array.isArray(dados?.Nomenclaturas) || !dados.Nomenclaturas.length) {
    return { erro: "JSON do Siscomex sem a lista `Nomenclaturas` — o formato da fonte mudou." };
  }
  return {
    ok: true, fonte: "NCM", url: r.url, bytes: r.buf.length, contentType: r.contentType,
    sha256: sha256(r.buf), conteudo: r.buf, dados,
    atoDeclarado: [dados.Ato, dados.Data_Ultima_Atualizacao_NCM].filter(Boolean).join(" — ") || null,
  };
}
