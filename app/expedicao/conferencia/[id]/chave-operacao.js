// Uma chave por TENTATIVA de lançamento — não por marca/quantidade, que podem legitimamente se
// repetir (duas remessas da mesma marca, uma atrás da outra). O componente que chama isto guarda
// o valor num ref e só pede um NOVO depois de um sucesso; reenviar o mesmo formulário depois de um
// erro manda a mesma chave, que é o que deixa o servidor reconhecer "isto já foi gravado" em vez
// de duplicar (achado do Codex, 09/09/2026 — ver a nota em lib/conferencia-peca.js).
//
// `crypto.randomUUID` falta em navegador antigo/http não-seguro; o fallback não precisa da mesma
// força de um UUID de verdade, só ser único o bastante para não colidir dentro de uma sessão.
export function chaveDeOperacao() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
