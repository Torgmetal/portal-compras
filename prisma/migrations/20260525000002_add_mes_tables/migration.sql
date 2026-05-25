-- CreateTable: MesApontamento
-- Apontamentos de produção sincronizados do SKA Syneco (dataset 242)
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
);

-- CreateTable: MesSyncLog
-- Histórico de execuções do agente de sync
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
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MesApontamento_productionId_key" ON "MesApontamento"("productionId");
CREATE INDEX IF NOT EXISTS "MesApontamento_opId_idx"       ON "MesApontamento"("opId");
CREATE INDEX IF NOT EXISTS "MesApontamento_obra_idx"       ON "MesApontamento"("obra");
CREATE INDEX IF NOT EXISTS "MesApontamento_dataInicio_idx" ON "MesApontamento"("dataInicio");
CREATE INDEX IF NOT EXISTS "MesApontamento_setor_idx"      ON "MesApontamento"("setor");
CREATE INDEX IF NOT EXISTS "MesApontamento_status_idx"     ON "MesApontamento"("status");
CREATE INDEX IF NOT EXISTS "MesSyncLog_criadoEm_idx"       ON "MesSyncLog"("criadoEm");
CREATE INDEX IF NOT EXISTS "MesSyncLog_sucesso_idx"        ON "MesSyncLog"("sucesso");

-- AddForeignKey (só adiciona se não existir)
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
END$$;
