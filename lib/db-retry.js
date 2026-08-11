// Resiliência a cold start do Neon (scale-to-zero). Quando a compute está
// suspensa, o PRIMEIRO query de um cron estoura antes dela acordar → P1001
// "Can't reach database server". `aquecerBanco` faz um SELECT 1 com retry/backoff
// pra acordar a compute antes do trabalho de verdade; `withDbRetry` reexecuta uma
// operação em erros transitórios de conexão. Ver docs/CLAUDE.md (Neon).

/** true para erros TRANSITÓRIOS de conexão (cold start, pool/conexão caída). */
export function ehErroConexao(e) {
  const code = e?.code || e?.errorCode;
  if (code === "P1001" || code === "P1002" || code === "P1008" || code === "P1017") return true;
  const m = String(e?.message || e || "");
  return /can'?t reach database server|connection.*(closed|terminated|reset|refused)|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|server (has )?closed the connection|Timed out fetching a new connection|Can not start a transaction|terminating connection/i.test(m);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * "Acorda" o Neon com SELECT 1 + retry/backoff. Só retenta em erro de conexão
 * (cold start); erro real é propagado na hora. Resolve quando o banco responde.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function aquecerBanco(prisma, { tentativas = 5, esperaMs = 2000, fator = 1.5 } = {}) {
  let atraso = esperaMs;
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (e) {
      ultimo = e;
      if (!ehErroConexao(e)) throw e; // não é cold start → erro de verdade
      if (i < tentativas - 1) { await espera(atraso); atraso = Math.round(atraso * fator); }
    }
  }
  throw ultimo;
}

/**
 * Reexecuta `fn` em erros transitórios de conexão (após um aquecimento inicial
 * ainda pode haver blip). Erro não-transitório sobe direto.
 */
export async function withDbRetry(fn, { tentativas = 3, esperaMs = 1500, fator = 1.5 } = {}) {
  let atraso = esperaMs;
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      if (!ehErroConexao(e) || i === tentativas - 1) throw e;
      await espera(atraso); atraso = Math.round(atraso * fator);
    }
  }
  throw ultimo;
}
