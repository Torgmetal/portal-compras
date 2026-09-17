// ─── UM CRON NÃO PODE ATROPELAR A SI MESMO ───────────────────────────────────
//
// ⚠⚠ ACHADO DO CODEX (17/09/2026): uma tarefa que LÊ o banco, gasta minutos de rede e só então
// GRAVA pode ter duas execuções sobrepostas aplicando retratos fora de ordem — a mais lenta grava
// por cima do que a mais nova já concluiu. O cron diário e o disparo manual da mesma rota convivem,
// e o manual costuma acontecer justamente quando alguém desconfia do automático.
//
// ⚠⚠ `pg_advisory_lock` NÃO RESOLVE ISSO AQUI, E EU TENTEI. Trava consultiva é de SESSÃO, e tanto o
// pooler do Neon quanto o pool do próprio Prisma podem atender dois `$queryRaw` em conexões
// diferentes — a trava sai numa conexão e a conferência acontece em outra. Medido: duas chamadas
// simultâneas ao cron `omie-encerrados` passaram AS DUAS, inteiras. Uma trava que não tranca é pior
// que nenhuma, porque parece segura. (A `comTravaDaObra` da conferência de peça funciona porque usa
// escopo de TRANSAÇÃO — o que aqui seria prender uma conexão durante as chamadas ao Omie.)
//
// ⚠ A saída é um arrendamento no próprio registro do heartbeat: uma linha, um UPDATE condicional,
// atômico no Postgres e indiferente a qual conexão o executou.
import { log } from "@/lib/log";

const registro = log("cron-trava");

/** Quanto tempo a vez fica reservada por padrão. */
export const TTL_PADRAO_MS = 10 * 60_000;

/**
 * Executa `fn` com a vez reservada para `job`. Se outra execução estiver com a vez, devolve `null`
 * SEM rodar nada.
 *
 * ⚠ Desistir em vez de esperar na fila é deliberado: a execução que chegou depois já colheu o
 * retrato dela (do Omie, do SharePoint) e esperar só a faria gravar um retrato velho mais tarde.
 * Melhor não rodar e dizer que não rodou.
 *
 * ⚠⚠ O PRAZO EXISTE PORQUE PROCESSO SERVERLESS MORRE SEM AVISO. Se a função for morta no meio (a
 * Vercel corta no `maxDuration`), ninguém executa o `finally` — sem prazo, a vez ficaria reservada
 * para sempre e o cron nunca mais rodaria. Passado o prazo, a próxima execução assume.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} job   a mesma chave usada no `registrarExecucao`
 * @param {() => Promise<T>} fn
 * @param {{ ttlMs?: number }} [opts]
 * @returns {Promise<T|null>} `null` quando a vez já estava tomada
 * @template T
 */
export async function comTravaDeCron(prisma, job, fn, opts = {}) {
  const ttl = Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : TTL_PADRAO_MS;
  const ate = new Date(Date.now() + ttl);

  // ⚠ `ON CONFLICT ... DO UPDATE ... WHERE` é a parte que torna isto atômico: o Postgres decide,
  // numa instrução só, se esta execução leva a vez. Ler-e-depois-gravar teria a mesma corrida que
  // a trava existe para eliminar.
  const linhas = await prisma.$queryRaw`
    INSERT INTO "CronHeartbeat" ("job", "lastRunAt", "ok", "travadoAte", "updatedAt")
    VALUES (${job}, now(), true, ${ate}, now())
    ON CONFLICT ("job") DO UPDATE SET "travadoAte" = EXCLUDED."travadoAte", "updatedAt" = now()
      WHERE "CronHeartbeat"."travadoAte" IS NULL OR "CronHeartbeat"."travadoAte" < now()
    RETURNING "job"`;

  if (!Array.isArray(linhas) || linhas.length === 0) {
    registro.aviso(`[${job}] vez já tomada por outra execução — pulando`);
    return null;
  }

  try {
    return await fn();
  } finally {
    // ⚠ Solta SEMPRE, inclusive quando o trabalho explode: senão o próximo disparo esperaria o TTL
    // inteiro por um erro que já aconteceu. E uma falha ao soltar não pode virar erro do cron —
    // o prazo devolve a vez sozinho.
    await prisma.$executeRaw`UPDATE "CronHeartbeat" SET "travadoAte" = NULL WHERE "job" = ${job}`
      .catch((e) => registro.erro(`[${job}] não consegui soltar a vez:`, e?.message));
  }
}
