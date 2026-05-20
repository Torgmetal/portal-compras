import { randomBytes } from "crypto";

// Caracteres sem ambiguidade visual (sem O/0, I/l/1)
const CHARSET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TAMANHO = 8;

/**
 * Gera uma senha temporária de 8 caracteres alfanuméricos aleatórios.
 * Usa crypto.randomBytes para segurança criptográfica.
 * @returns {string} Senha em plaintext
 */
export function gerarSenhaTemporaria() {
  let senha = "";
  // Gera bytes extras pra evitar bias no módulo
  const bytes = randomBytes(TAMANHO * 4);
  let idx = 0;
  while (senha.length < TAMANHO) {
    const byte = bytes[idx++];
    // Descarta bytes que causariam bias (acima do maior múltiplo de CHARSET.length)
    if (byte < 256 - (256 % CHARSET.length)) {
      senha += CHARSET[byte % CHARSET.length];
    }
  }
  return senha;
}
