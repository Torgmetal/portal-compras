/**
 * lib/assistente/modelo.js
 *
 * Qual modelo o Torguinho usa. `ConfigAssistente.modelo` com "auto" deixa a rota escolher por
 * pergunta (Haiku no dia a dia; Sonnet na pergunta complexa, com anexo ou que exige várias
 * consultas). Qualquer outro valor fixa o modelo para todas as perguntas.
 *
 * ⚠⚠ O PADRÃO DO BANCO FIXAVA O HAIKU SEM NINGUÉM ESCOLHER. A coluna nasce com
 * "claude-haiku-4-5" e a tela só oferecia Haiku ou Sonnet 4.5: como a rota tratava qualquer valor
 * como escolha do admin, a escolha por pergunta (e a escalada para o Sonnet 4.6) nunca rodava.
 */
export const MODELO_AUTOMATICO = "auto";

/** O modelo fixado pelo admin, ou null quando a escolha é automática. */
export function modeloForcadoDe(config) {
  const m = String(config?.modelo || "").trim();
  return m && m !== MODELO_AUTOMATICO ? m : null;
}
