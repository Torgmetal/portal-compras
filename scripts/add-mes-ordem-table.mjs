import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MesOrdem" (
      "id"            TEXT             NOT NULL,
      "obra"          TEXT             NOT NULL,
      "op"            TEXT             NOT NULL,
      "operacao"      TEXT             NOT NULL,
      "item"          TEXT             NOT NULL,
      "setor"         TEXT,
      "descItem"      TEXT,
      "maquina"       TEXT,
      "operador"      TEXT,
      "planejadoUn"   DOUBLE PRECISION NOT NULL DEFAULT 0,
      "produzidoUn"   DOUBLE PRECISION NOT NULL DEFAULT 0,
      "rejeitadoUn"   DOUBLE PRECISION NOT NULL DEFAULT 0,
      "saldoUn"       DOUBLE PRECISION NOT NULL DEFAULT 0,
      "pesoPlanejado" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "pesoProduzido" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "saldoRestante" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "status"        TEXT,
      "productionId"  INTEGER,
      "dataInicio"    TIMESTAMP(3),
      "dataFim"       TIMESTAMP(3),
      "opId"          TEXT,
      "syncRunId"     TEXT,
      "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MesOrdem_pkey" PRIMARY KEY ("id")
    )
  `);

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "MesOrdem_obra_op_operacao_item_key" ON "MesOrdem"("obra","op","operacao","item")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesOrdem_obra_idx"   ON "MesOrdem"("obra")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesOrdem_setor_idx"  ON "MesOrdem"("setor")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesOrdem_status_idx" ON "MesOrdem"("status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MesOrdem_opId_idx"   ON "MesOrdem"("opId")`);

  console.log("Tabela MesOrdem criada/verificada com sucesso.");
}

main()
  .catch((e) => console.error("Erro:", e.message))
  .finally(() => prisma.$disconnect());
