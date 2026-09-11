import "server-only";
import { temAcessoDiretoria } from "./diretoria";

// Responsável técnico autorizado por Vitor em 11/09/2026.
// Esta autorização vale só para Análise Crítica; não concede acesso à Diretoria.
const RESPONSAVEIS_APROVACAO = new Set(["guilherme@torg.com.br"]);

export async function podeAprovarAnaliseCritica(email) {
  const normalizado = String(email || "").trim().toLowerCase();
  return RESPONSAVEIS_APROVACAO.has(normalizado) || await temAcessoDiretoria(normalizado);
}
