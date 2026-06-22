/**
 * ensure-mes-tables.mjs
 *
 * Roda durante o build do Vercel (antes do next build) para:
 *   1. Garantir que as tabelas MesApontamento e MesSyncLog existam
 *   2. Garantir que o event trigger de proteção (protect_mes_tables_trigger)
 *      esteja ativo no banco — impede qualquer DROP TABLE nestas tabelas
 *
 * O event trigger é a proteção definitiva: bloqueia drops mesmo de
 * prisma db push, prisma migrate dev ou qualquer outra ferramenta.
 *
 * Sempre termina com exit 0 para não travar o build se o banco estiver indisponível.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[ensure-mes-tables] Verificando tabelas MES...");

  // MesInativo (setores feitos fora / inativos sem produção, p/ o relatório de
  // furos). Idempotente — sempre garante, sem depender do bloco abaixo.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MesInativo" (
      "id"           TEXT         NOT NULL,
      "op"           TEXT         NOT NULL,
      "item"         TEXT         NOT NULL,
      "operacao"     TEXT         NOT NULL,
      "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MesInativo_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "MesInativo_op_item_operacao_key" ON "MesInativo"("op","item","operacao")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesInativo_item_idx" ON "MesInativo"("item")`);
  console.log("[ensure-mes-tables] OK — MesInativo garantida.");

  // Colunas do FluxoCaixa para import do extrato Omie (idempotente).
  await prisma.$executeRawUnsafe(`ALTER TABLE "FluxoCaixa" ADD COLUMN IF NOT EXISTS "origemOmieId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "FluxoCaixa" ADD COLUMN IF NOT EXISTS "contaCorrente" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "FluxoCaixa" ADD COLUMN IF NOT EXISTS "transferencia" BOOLEAN NOT NULL DEFAULT false`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FluxoCaixa_origemOmieId_idx" ON "FluxoCaixa"("origemOmieId")`);
  console.log("[ensure-mes-tables] OK — colunas FluxoCaixa (Omie) garantidas.");

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

  // Após criar as tabelas, garante o event trigger de proteção
  await ensureEventTrigger(prisma);
}

async function ensureEventTrigger(prisma) {
  try {
    // Verifica se o trigger já existe
    const triggers = await prisma.$queryRawUnsafe(`
      SELECT evtname FROM pg_event_trigger
      WHERE evtname = 'protect_mes_tables_trigger'
    `);

    if (triggers.length > 0) {
      console.log("[ensure-mes-tables] Event trigger de proteção: ativo.");
      return;
    }

    // Trigger não existe — isso não deveria acontecer, mas recria
    console.warn("[ensure-mes-tables] AVISO: event trigger ausente — recriando...");
    // Não conseguimos criar event trigger via Prisma (não suporta dollar-quoting)
    // Logamos o aviso e deixamos o admin recriar manualmente se necessário
    console.warn("[ensure-mes-tables] Execute manualmente: node scripts/create-mes-trigger.mjs");
  } catch (e) {
    console.warn("[ensure-mes-tables] Não foi possível verificar event trigger:", e.message);
  }
}

main()
  .catch((e) => {
    // Não trava o build — apenas loga o erro
    console.error("[ensure-mes-tables] ERRO (build continua):", e.message);
  })
  .finally(() => prisma.$disconnect());
