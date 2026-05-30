/**
 * Normaliza nome de empresa pra Title Case, respeitando convenções
 * brasileiras: preposições em minúsculo, siglas curtas em maiúsculo.
 *
 * Exemplos:
 *   "GERDAU"           → "Gerdau"
 *   "JD AÇO"           → "JD Aço"
 *   "A2 METAIS"        → "A2 Metais"
 *   "R SIMIONI"        → "R Simioni"
 *   "HARD PARAFUSOS"   → "Hard Parafusos"
 *   "INDUSTRIA DE AÇOS" → "Industria de Aços"
 */

const PREPOSICOES = new Set([
  "de", "da", "do", "dos", "das", "e", "em", "na", "no", "nos", "nas",
  "para", "por", "com", "sem",
]);

function titleCaseNome(str) {
  if (!str) return str;
  return str
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, index) => {
      if (!word) return word;
      const lower = word.toLowerCase();

      // Preposições em minúsculo (exceto primeira palavra)
      if (index > 0 && PREPOSICOES.has(lower)) return lower;

      // Palavras com dígitos (A2, 3M, etc.) — manter maiúsculo
      if (/\d/.test(word)) return word.toUpperCase();

      // Palavra de 1 caractere — manter maiúsculo (ex: "R" Simioni)
      if (word.length === 1) return word.toUpperCase();

      // Palavra de 2 caracteres sem vogal — provável sigla (JD, MG, SP)
      if (word.length === 2 && !/[aeiouáéíóúâêôã]/i.test(word)) return word.toUpperCase();

      // Normal: Title Case (primeira maiúscula, resto minúsculo)
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Gera uma chave normalizada pra comparação de duplicatas.
 * Remove acentos, pontuação, espaços extras e converte pra minúsculo.
 *
 * "Soufer Industrial Ltda." → "soufer industrial ltda"
 * "SOUFER  INDUSTRIAL" → "soufer industrial"
 */
function chaveNormalizacao(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/gi, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { titleCaseNome, chaveNormalizacao };
