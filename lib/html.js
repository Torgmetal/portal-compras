// Helpers de HTML — escape canônico para evitar XSS/HTML-injection.
//
// Use escapeHtml() em TODO dado dinâmico (nome de fornecedor, cliente, obra,
// observação, etc.) ao montar HTML de email ou ao injetar em innerHTML.
// Centralizado aqui para não haver versões divergentes espalhadas pelo código.

/**
 * Escapa os 5 caracteres perigosos em contexto HTML (texto e atributos com aspas).
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Higieniza um texto curto vindo de input não-confiável que será persistido:
 * trim, remove caracteres de controle e os sinais de menor/maior, e limita
 * o tamanho. Defesa em profundidade — não substitui o escape no output.
 * @param {unknown} s
 * @param {number} max  tamanho máximo (default 200)
 * @returns {string}
 */
export function limparTextoCurto(s, max = 200) {
  const CONTROLE = new RegExp("[\\x00-\\x1F\\x7F]", "g");
  return String(s ?? "")
    .replace(CONTROLE, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}
