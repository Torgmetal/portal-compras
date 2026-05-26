// Singleton do Prisma Client — evita criar múltiplas conexões em dev (hot reload)
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// ─── Verificação de tabelas MES ─────────────────────────────────────────────
// As tabelas MES são protegidas por um event trigger no PostgreSQL que impede
// qualquer DROP TABLE em MesApontamento e MesSyncLog (inclusive via prisma db push).
// Esta função apenas verifica a existência e loga erro crítico se ausentes.
// As rotas MES importam `waitMesTables()` e aguardam antes de qualquer query.

if (!globalForPrisma.__mesTablesPromise) {
  globalForPrisma.__mesTablesPromise = _checkMesTables();
}

export function waitMesTables() {
  return globalForPrisma.__mesTablesPromise;
}

async function _checkMesTables() {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'
       AND tablename IN ('MesApontamento', 'MesSyncLog')`
    );
    if (rows.length === 2) return; // ambas existem — caso normal
    console.error(
      "[prisma] ERRO CRITICO: tabelas MES ausentes no banco de dados. " +
      "O event trigger de protecao pode ter sido removido. " +
      "Execute: npx prisma db execute --file prisma/migrations/20260525000002_add_mes_tables/migration.sql"
    );
  } catch (e) {
    console.error("[prisma] Erro ao verificar tabelas MES:", e.message);
  }
}
