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

// ─── Garantia de tabelas MES ────────────────────────────────────────────────
// Executa uma vez por cold start do servidor. Verifica se MesApontamento e
// MesSyncLog existem e as recria (IF NOT EXISTS) se necessário.
// As rotas MES importam `waitMesTables()` e aguardam antes de qualquer query.

if (!globalForPrisma.__mesTablesPromise) {
  globalForPrisma.__mesTablesPromise = _ensureMesTables();
}

export function waitMesTables() {
  return globalForPrisma.__mesTablesPromise;
}

async function _ensureMesTables() {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'
       AND tablename IN ('MesApontamento', 'MesSyncLog')`
    );
    if (rows.length === 2) return; // ambas existem — caso normal (99,9%)

    console.warn("[prisma] AVISO: tabelas MES ausentes — recriando automaticamente...");

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MesApontamento" (
        "id"            TEXT             NOT NULL,
        "productionId"  INTEGER          NOT NULL,
        "dataInicio"    TIMESTAMP(3)     NOT NULL,
        "dataFim"       TIMESTAMP(3),
        "obra"          TEXT             NOT NULL,
        "opSka"         TEXT,
        "setor"         TEXT,
        "maquina"       TEXT,
        "codigoMaquina" TEXT,
        "operacao"      TEXT,
        "descricaoItem" TEXT,
        "operador"      TEXT,
        "status"        TEXT,
        "produzidoUn"   DOUBLE PRECISION NOT NULL DEFAULT 0,
        "rejeitado"     DOUBLE PRECISION NOT NULL DEFAULT 0,
        "retrabalhado"  DOUBLE PRECISION NOT NULL DEFAULT 0,
        "produzidoKg"   DOUBLE PRECISION NOT NULL DEFAULT 0,
        "opId"          TEXT,
        "syncRunId"     TEXT,
        "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MesApontamento_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MesSyncLog" (
        "id"          TEXT         NOT NULL,
        "sucesso"     BOOLEAN      NOT NULL,
        "dataInicio"  TIMESTAMP(3) NOT NULL,
        "dataFim"     TIMESTAMP(3) NOT NULL,
        "totalLinhas" INTEGER      NOT NULL DEFAULT 0,
        "criados"     INTEGER      NOT NULL DEFAULT 0,
        "atualizados" INTEGER      NOT NULL DEFAULT 0,
        "ignorados"   INTEGER      NOT NULL DEFAULT 0,
        "erro"        TEXT,
        "duracaoMs"   INTEGER      NOT NULL DEFAULT 0,
        "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MesSyncLog_pkey" PRIMARY KEY ("id")
      )
    `);

    // Índices
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "MesApontamento_productionId_key" ON "MesApontamento"("productionId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesApontamento_opId_idx"       ON "MesApontamento"("opId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesApontamento_obra_idx"       ON "MesApontamento"("obra")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesApontamento_dataInicio_idx" ON "MesApontamento"("dataInicio")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesApontamento_setor_idx"      ON "MesApontamento"("setor")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesApontamento_status_idx"     ON "MesApontamento"("status")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesSyncLog_criadoEm_idx"       ON "MesSyncLog"("criadoEm")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesSyncLog_sucesso_idx"        ON "MesSyncLog"("sucesso")`);

    // FK opcional
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'MesApontamento_opId_fkey'
          ) THEN
            ALTER TABLE "MesApontamento"
              ADD CONSTRAINT "MesApontamento_opId_fkey"
              FOREIGN KEY ("opId") REFERENCES "OP"("id")
              ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END $$
      `);
    } catch (_) {}

    console.warn("[prisma] Tabelas MES recriadas com sucesso.");
  } catch (e) {
    console.error("[prisma] Erro ao garantir tabelas MES:", e.message);
    // Não lança — permite que o servidor suba mesmo assim
  }
}
