import "server-only";

// ─── AS TRAVAS DO APONTAMENTO ────────────────────────────────────────────────
//
// Saiu de `lib/mes/sessao.js` quando ele passou de 350 linhas. É o mesmo mecanismo da Conferência
// de Peça (`lib/conferencia-peca.js`), um andar acima: quem disputa espera na fila do Postgres em
// vez de ler um retrato velho.

/**
 * Serializa qualquer leitura+gravação que dispute UM recurso.
 *
 * ⚠⚠ MESMA LIÇÃO DA CONFERÊNCIA DE PEÇA, UM ANDAR ACIMA. Lá, dois "+1" simultâneos na mesma marca
 * passavam os dois porque cada um lia o saldo antes de o outro gravar. Aqui o disputado é o próprio
 * recurso: dois totens (ou dois cliques) abrindo sessão na mesma máquina leem "não há sessão
 * aberta" ao mesmo tempo e criam duas. `pg_advisory_xact_lock` põe o segundo na fila do Postgres
 * até o primeiro terminar a transação, então ele lê o mundo já atualizado.
 *
 * ⚠ Escopo de TRANSAÇÃO, não de sessão de banco — é o que funciona com o pooler do Neon.
 *
 * @param {(tx: import("@prisma/client").Prisma.TransactionClient) => Promise<T>} fn
 * @template T
 */
export async function comTravaDoRecurso(prisma, recursoId, fn) {
  return comTravaDe(prisma, [recursoId], fn);
}

/**
 * Trava VÁRIAS chaves de uma vez, em ordem determinística.
 *
 * ⚠⚠ O TETO DO PLANEJADO NÃO É DO RECURSO — É DA MARCA, E ATRAVESSA OS RECURSOS (achado do Codex,
 * 13/09/2026; defeito que já existia antes do lote). `saldoDaMarca` soma as boas de TODAS as
 * sessões daquela obra+marca, em qualquer posto; mas a trava serializava só o recurso. Dois postos
 * lançando a mesma marca ao mesmo tempo liam o mesmo saldo e passavam os dois — exatamente a
 * corrida que a Conferência de Peça já tinha pago para aprender.
 *
 * ⚠⚠ A ORDEM É O QUE EVITA ABRAÇO MORTAL. Dois lançamentos que precisam das mesmas duas chaves em
 * ordens opostas travariam um ao outro para sempre. Ordenando as chaves antes, todo mundo pede na
 * mesma sequência.
 *
 * ⚠ E colisão de `hashtext` não quebra isso (dúvida levantada pelo Codex em 14/09/2026, examinada
 * e descartada): duas chaves diferentes com o mesmo hash viram o MESMO lock, e pedir o mesmo
 * advisory lock duas vezes dentro da transação é reentrante. O que evita o abraço é todos os
 * caminhos pedirem na mesma ordem — e a ordem é a das strings, que é estável em todos eles.
 */
export async function comTravaDe(prisma, chaves, fn) {
  const ordenadas = [...new Set(chaves.filter(Boolean))].sort();
  return prisma.$transaction(async (tx) => {
    for (const chave of ordenadas) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))`;
    }
    return fn(tx);
  }, { timeout: 15_000, maxWait: 15_000 });
}
