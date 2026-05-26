/**
 * ensure-mes-tables.mjs
 *
 * Roda durante o build do Vercel (antes do next build) para garantir que as
 * tabelas MesApontamento e MesSyncLog existam no banco de produção.
 *
 * Por que isso é necessário:
 *   - `prisma migrate deploy` pula migrations já marcadas em _prisma_migrations,
 *     mesmo que as tabelas tenham sumido por algum motivo externo.
 *   - Este script verifica a existência real das tabelas e as cria se ausentes,
 *     usando o mesmo SQL idempotente da migration (CREATE TABLE IF NOT EXISTS).
 *
 * Sempre termina com exit 0 para não travar o build se o banco estiver indisponível.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[ensure-mes-tables] Verificando tabelas MES...");

  // Verifica quais das duas tabelas existem
  const existentes = await prisma.$queryRawUnsafe(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('MesApontamento', 'MesSyncLog')
  `);

  const nomes = existentes.map((r) => r.tablename);
  const faltando = ["MesApontamento", "MesSyncLog"].filter((t) => !nomes.includes(t));

  if (faltando.length === 0) {
    console.log("[ensure-mes-tables] OK — tabelas MesApontamento e MesSyncLog existem.");
    return;
  }

  console.log(`[ensure-mes-tables] AVISO — tabelas ausentes: ${faltando.join(", ")}. Criando...`);

  // SQL idempotente (IF NOT EXISTS) — mesma lógica da migration oficial
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

  // FK opcional (não falha se OP não existir)
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'MesApontamento_opId_fkey'
        ) THEN
          ALTER TABLE "MesApontamento"
            ADD CONSTRAINT "MesApontamento_opId_fkey"
            FOREIGN KEY ("opId") REFERENCES "OP"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END$$
    `);
  } catch (e) {
    console.warn("[ensure-mes-tables] FK opId ignorada:", e.message);
  }

  console.log("[ensure-mes-tables] Tabelas MES criadas com sucesso.");
}

main()
  .catch((e) => {
    // Não trava o build — apenas loga o erro
    console.error("[ensure-mes-tables] ERRO (build continua):", e.message);
  })
  .finally(() => prisma.$disconnect());
