/**
 * Rate limiter simples em memória para endpoints públicos.
 *
 * Limitação: cada instância serverless (cold start) tem seu próprio Map,
 * então não é perfeito contra DDoS distribuído. Mas bloqueia brute-force
 * e spam de um mesmo IP em uma mesma instância — já é uma grande melhoria
 * sobre zero rate limiting.
 *
 * Para rate limiting distribuído real, migrar para @upstash/ratelimit + Redis.
 */

const stores = new Map(); // chave: nome do limiter → Map<ip, {count, resetAt}>

/**
 * Cria um rate limiter nomeado.
 * @param {{ name: string, maxRequests: number, windowMs: number }} opts
 * @returns {(req: Request) => { success: boolean, remaining: number, resetAt: number }}
 */
export function createRateLimiter({ name, maxRequests = 20, windowMs = 60_000 }) {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }

  return function check(req) {
    const store = stores.get(name);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const now = Date.now();
    let entry = store.get(ip);

    // Limpar entradas antigas para evitar memory leak
    if (store.size > 10_000) {
      for (const [key, val] of store) {
        if (val.resetAt < now) store.delete(key);
      }
    }

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      return {
        success: false,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    return {
      success: true,
      remaining: maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  };
}

/**
 * Headers de rate limit padrão para incluir na response.
 */
export function rateLimitHeaders(result) {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
