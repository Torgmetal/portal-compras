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
  const vez = await reservarVez(prisma, job, opts.ttlMs);
  if (!vez.ok) return null;

  try {
    return await fn();
  } finally {
    // ⚠ Solta SEMPRE, inclusive quando o trabalho explode: senão o próximo disparo esperaria o TTL
    // inteiro por um erro que já aconteceu. E uma falha ao soltar não pode virar erro do cron —
    // o prazo devolve a vez sozinho.
    await soltarVez(prisma, job);
  }
}

/**
 * Tenta reservar a vez de `job` até daqui a `ttlMs`. NÃO solta sozinha — quem chama decide.
 *
 * ⚠⚠ É A MESMA LINHA QUE SERVE A DUAS COISAS DIFERENTES, E DE PROPÓSITO. Com `soltarVez` no
 * `finally` ela é uma TRAVA (ninguém roda junto). Sem soltar, ela é um INTERVALO MÍNIMO: a vez
 * fica reservada até o prazo vencer, e é assim que o botão de sincronizar manual evita que dez
 * cliques virem dez varreduras no Omie. Uma tabela nova para isso seria a mesma linha com outro
 * nome.
 *
 * ⚠⚠ O PRAZO É CALCULADO DENTRO DO SQL (`now() + N * interval '1 second'`), NUNCA EM JS. A versão
 * anterior mandava um `new Date(Date.now() + ttl)` e o Postgres o comparava com o `now()` DELE —
 * dois relógios. Medido em 17/09/2026 na máquina de dev: o WSL estava **241 segundos à frente** do
 * Neon, e a vez de 2 minutos virava uma vez de **6 minutos** para o banco; pior, o app calculava
 * "faltam N segundos" pelo relógio dele e dizia **1 segundo** onde o banco ainda guardava 137 —
 * mandando a pessoa clicar de novo numa vez que não estava livre. Na Vercel os relógios andam
 * juntos, mas trava que depende disso é trava que falha no dia em que não andarem.
 *
 * @returns {Promise<{ok: boolean, faltamSegundos: number|null}>} em `ok:false`, quantos segundos
 *   faltam para a vez se liberar (ou `null` se nem isso deu para ler).
 */
export async function reservarVez(prisma, job, ttlMs) {
  const seg = Math.ceil((Number(ttlMs) > 0 ? Number(ttlMs) : TTL_PADRAO_MS) / 1000);

  // ⚠ `ON CONFLICT ... DO UPDATE ... WHERE` é a parte que torna isto atômico: o Postgres decide,
  // numa instrução só, se esta execução leva a vez. Ler-e-depois-gravar teria a mesma corrida que
  // a trava existe para eliminar.
  const linhas = await prisma.$queryRaw`
    INSERT INTO "CronHeartbeat" ("job", "lastRunAt", "ok", "travadoAte", "updatedAt")
    VALUES (${job}, now(), true, now() + ${seg} * interval '1 second', now())
    ON CONFLICT ("job") DO UPDATE
      SET "travadoAte" = now() + ${seg} * interval '1 second', "updatedAt" = now()
      WHERE "CronHeartbeat"."travadoAte" IS NULL OR "CronHeartbeat"."travadoAte" < now()
    RETURNING "travadoAte"`;

  if (Array.isArray(linhas) && linhas.length > 0) return { ok: true, faltamSegundos: seg };

  registro.aviso(`[${job}] vez já tomada por outra execução — pulando`);
  // ⚠ Quem foi barrado precisa dizer à pessoa QUANTO esperar; "tente mais tarde" sem número faz
  // ela clicar de novo na hora. Falhar a leitura não muda a decisão — só o texto.
  const atual = await prisma.$queryRaw`
    SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM ("travadoAte" - now()))))::int AS faltam
    FROM "CronHeartbeat" WHERE "job" = ${job}`.catch(() => null);
  const faltam = Array.isArray(atual) ? atual[0]?.faltam : null;
  // ⚠⚠ `Number(null)` É ZERO, e zero aqui significaria "pode clicar de novo agora" — exatamente o
  // contrário do que uma leitura que falhou autoriza a dizer. Sem número é `null`, e a tela
  // escreve "em instantes".
  const n = faltam == null ? NaN : Number(faltam);
  return { ok: false, faltamSegundos: Number.isFinite(n) ? n : null };
}

/**
 * Empurra o prazo de uma vez que JÁ é sua, contado a partir de agora.
 *
 * ⚠⚠ MEDIDO EM 17/09/2026: a rodada do botão manual levou 111s, e como o intervalo mínimo de 2min
 * fora reservado no INÍCIO, sobravam 10 segundos de espera — o intervalo praticamente não existia
 * justamente nas rodadas longas, que são as caras. Intervalo entre duas coisas se conta do FIM de
 * uma ao começo da outra.
 *
 * ⚠ Sem `WHERE`: quem chama está com a vez na mão. Não serve para tomar a vez de ninguém.
 */
export async function renovarVez(prisma, job, ttlMs) {
  const seg = Math.ceil((Number(ttlMs) > 0 ? Number(ttlMs) : TTL_PADRAO_MS) / 1000);
  // ⚠ Devolve se renovou DE VERDADE (achado do Codex, 17/09/2026): engolir a falha e responder
  // "renovei por 120s" faria o intervalo mínimo parecer garantido quando não é.
  const linhas = await prisma.$executeRaw`
    UPDATE "CronHeartbeat" SET "travadoAte" = now() + ${seg} * interval '1 second', "updatedAt" = now()
    WHERE "job" = ${job}`
    .catch((e) => { registro.erro(`[${job}] não consegui renovar a vez:`, e?.message); return 0; });
  return { ok: Number(linhas) > 0, segundos: seg };
}

/** Devolve a vez de `job`. Nunca lança: o prazo já devolveria sozinho. */
export async function soltarVez(prisma, job) {
  await prisma.$executeRaw`UPDATE "CronHeartbeat" SET "travadoAte" = NULL WHERE "job" = ${job}`
    .catch((e) => registro.erro(`[${job}] não consegui soltar a vez:`, e?.message));
}
