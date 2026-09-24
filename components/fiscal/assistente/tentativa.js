// ─── A TENTATIVA QUE O REENVIO REPETE ────────────────────────────────────────
//
// ⚠⚠ A CHAVE SOZINHA NÃO BASTA (achado do Codex, 24/09/2026). O servidor liga a chave ao hash de
// (pergunta, conversaId, sha do anexo) e recusa com 409 a mesma chave com outro conteúdo. Só que,
// entre o envio e a queda da conexão, a tela já tinha mudado dois desses três: o evento `etapa`
// troca a conversa atual pela recém-criada, e o anexo é limpo antes de o fluxo ser lido. Reenviar
// com o estado ATUAL da tela mandava a chave antiga com outro conteúdo — 409 na primeira pergunta
// de uma conversa e em toda pergunta com XML, sem recuperar a resposta que já estava paga.
//
// ⚠ Por isso a tentativa guarda o conteúdo INTEIRO junto da chave, e o reenvio da mesma pergunta
// manda exatamente o que foi mandado da primeira vez. Pergunta diferente é tentativa nova.

/**
 * @param {object|null} pendente a tentativa que falhou sem resposta, ou null
 * @param {{pergunta: string, conversaId: string|null, arquivo: File|null}} agora o estado da tela
 * @param {() => string} gerarChave
 */
export function tentativaPara(pendente, { pergunta, conversaId, arquivo }, gerarChave) {
  if (pendente && pendente.pergunta === pergunta) return pendente;
  return { chave: gerarChave(), pergunta, conversaId: conversaId ?? null, arquivo: arquivo ?? null };
}
