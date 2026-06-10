// Validação de URLs do Vercel Blob — defesa contra SSRF.
//
// O app aceita `blobUrl` vindo do cliente e depois faz fetch server-side dela
// (rotas analisar-*, converter-dwg). Sem restringir o host, um usuário podia
// apontar para 169.254.169.254 (metadata do cloud), localhost ou a rede interna
// e fazer o servidor buscar/refletir esse conteúdo. O Vercel Blob SEMPRE serve
// em "*.public.blob.vercel-storage.com", então restringimos a esse sufixo.

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * True se a URL é uma URL https válida do armazenamento Vercel Blob.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isBlobUrlSegura(url) {
  if (typeof url !== "string" || !url) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  // endsWith do sufixo com ponto impede bypass tipo "...vercel-storage.com.evil.com"
  return u.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX);
}

/**
 * Lança se a URL não for uma URL segura do Vercel Blob. Retorna a URL se ok.
 * @param {string} url
 */
export function assertBlobUrlSegura(url) {
  if (!isBlobUrlSegura(url)) {
    throw new Error("blobUrl não permitida: apenas URLs do armazenamento Vercel Blob são aceitas");
  }
  return url;
}
