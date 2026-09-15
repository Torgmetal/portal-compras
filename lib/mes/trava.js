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
 * ⚠⚠ E A ORDEM TEM DE SER A DOS LOCKS, NÃO A DAS STRINGS — eu tinha concluído o contrário e
 * ESCREVI ISSO AQUI COMO SE FOSSE VERDADE (14/09/2026). O Codex levantou a colisão de hash, eu
 * examinei, "descartei" com o argumento de que chaves colidentes viram o mesmo lock e o advisory
 * lock é reentrante — e o argumento está errado. A reentrância impede a transação de travar a si
 * mesma; ela não impede DUAS transações de pedirem os mesmos dois locks em ordem trocada:
 *
 *     strings   a < b < c          (ordenadas, como o código fazia)
 *     hashes    H(a)=X, H(b)=Y, H(c)=X
 *     T1 pede [a,b] → X, depois Y
 *     T2 pede [b,c] → Y, depois X      ← ordem invertida NOS LOCKS
 *
 * T1 segura X esperando Y; T2 segura Y esperando X. O Postgres detecta e MATA uma das duas — não
 * fica travado para sempre, mas um operador leva erro de deadlock no meio do turno, e o defeito só
 * aparece quando duas chaves quaisquer colidirem, o que ninguém reproduz de propósito.
 *
 * Sem colisão isto não acontece: as chaves comuns a duas transações mantêm entre si a mesma ordem
 * relativa nos dois lados. É a colisão que faz dois locks "comuns" virem de chaves DIFERENTES em
 * cada uma, e é aí que a ordem inverte. Por isso a ordenação passou a ser pelo ID DO LOCK.
 */
export async function comTravaDe(prisma, chaves, fn) {
  const ids = idsDeTrava(chaves);
  return prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${id}::bigint)`;
    }
    return fn(tx);
  }, { timeout: 15_000, maxWait: 15_000 });
}

/**
 * O id de lock de uma chave — FNV-1a de 32 bits, com sinal, como o `hashtext` do Postgres.
 *
 * ⚠ CALCULADO AQUI, E NÃO NO BANCO, para que a ordem de aquisição seja decidida ANTES de a
 * transação abrir: com `hashtext(...)` dentro do SQL, o valor do lock só existia no servidor e
 * ordenar por ele exigiria uma ida a mais ao banco a cada passagem.
 *
 * ⚠ Ele colide, como todo hash de 32 bits — e agora isso é inofensivo: chaves que colidem viram o
 * MESMO id, o `Set` deixa um só, e a ordem é a dos ids. O que a colisão custa é serializar duas
 * coisas sem relação de vez em quando, que é lentidão, não corrida.
 */
export function idDaChave(chave) {
  let h = 0x811c9dc5;
  const t = String(chave);
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0; // int32 com sinal, como hashtext
}

/**
 * Os ids de lock a pedir, sem repetição e em ORDEM GLOBAL — a ordem que todos os caminhos seguem.
 *
 * @param {string[]} chaves
 * @param {(c:string)=>number} [hash]  injetável só para o teste forçar uma colisão de propósito
 */
export function idsDeTrava(chaves, hash = idDaChave) {
  return [...new Set((chaves || []).filter(Boolean).map((c) => hash(String(c))))].sort((a, b) => a - b);
}
