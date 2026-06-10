import { randomBytes } from "node:crypto";

// Token forte para links públicos (portais de fornecedor/cobrança).
// 32 bytes = 256 bits de entropia, base64url (seguro em URL, sem padding).
// NÃO use cuid() para isso: cuid tem timestamp+contador previsíveis e usa
// Math.random — é enumerável e vaza dados de quem tem o link adivinhado.
export function gerarTokenForte(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
