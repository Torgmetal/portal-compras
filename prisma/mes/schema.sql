-- ══════════════════════════════════════════════════════════════════════════════
-- O SCHEMA `mes` — GERADO DE `prisma/mes/schema.prisma`, TORNADO IDEMPOTENTE À MÃO
--
-- ⚠⚠ NÃO EDITE ESTE ARQUIVO PARA MUDAR O MODELO. Ele é a tradução do schema do Prisma; quem manda
-- é `prisma/mes/schema.prisma`. Para regerar a base:
--     npx prisma migrate diff --from-empty --to-schema-datamodel prisma/mes/schema.prisma --script
-- e refaça as três transformações: `IF NOT EXISTS` nas tabelas e índices, qualificação com `mes.`,
-- e o `DO $$` em volta de cada FK (Postgres não tem `ADD CONSTRAINT IF NOT EXISTS`).
--
-- ⚠⚠ NUNCA `prisma db push` CONTRA PRODUÇÃO — regra da casa. É por isso que a criação mora aqui,
-- num script idempotente chamado no `build`, e não num comando que sincroniza schema às cegas.
--
-- ⚠ Tudo é qualificado com `mes.` EXPLICITAMENTE, em vez de confiar no `search_path` da conexão.
-- Uma URL sem `schema=mes` (um `.env` velho, uma máquina nova) criaria as 14 tabelas do MES dentro
-- do schema do portal — e aí a separação teria existido só no código.
-- ══════════════════════════════════════════════════════════════════════════════

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "mes";

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesSetor" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "cor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesSetor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesRecurso" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigoSyneco" TEXT,
    "setorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'MAQUINA',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "temTerminal" BOOLEAN NOT NULL DEFAULT true,
    "ambiente" TEXT NOT NULL DEFAULT 'PROD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesRecurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesOperador" (
    "id" TEXT NOT NULL,
    "cracha" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "funcionarioId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ambiente" TEXT NOT NULL DEFAULT 'PROD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesOperador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesMotivoParada" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "planejada" BOOLEAN NOT NULL DEFAULT false,
    "cor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesMotivoParada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesPresenca" (
    "id" TEXT NOT NULL,
    "operadorId" TEXT NOT NULL,
    "recursoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "motivoFim" TEXT,
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerradaEm" TIMESTAMP(3),
    "ambiente" TEXT NOT NULL DEFAULT 'PROD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesPresenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesSessao" (
    "id" TEXT NOT NULL,
    "recursoId" TEXT NOT NULL,
    "operadorId" TEXT,
    "opId" TEXT,
    "opNumero" TEXT,
    "marca" TEXT,
    "pecaId" TEXT,
    "operacao" TEXT,
    "chaveTrabalho" TEXT NOT NULL DEFAULT '—',
    "lotes" TEXT[],
    "nestingUnidades" TEXT[],
    "planejadoQtd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "planejadoManual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerradaEm" TIMESTAMP(3),
    "ambiente" TEXT NOT NULL DEFAULT 'PROD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesSessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesEvento" (
    "id" TEXT NOT NULL,
    "recursoId" TEXT NOT NULL,
    "sessaoId" TEXT,
    "operadorId" TEXT,
    "tipo" TEXT NOT NULL,
    "motivoId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'TERMINAL',
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chaveIdem" TEXT,
    "sequencia" INTEGER,
    "detalhe" TEXT,
    "ambiente" TEXT NOT NULL DEFAULT 'PROD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MesEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesApontamentoQtd" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "operadorId" TEXT,
    "boas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rejeitadas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retrabalho" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "origem" TEXT NOT NULL DEFAULT 'TERMINAL',
    "chaveOperacao" TEXT,
    "observacao" TEXT,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ambiente" TEXT NOT NULL DEFAULT 'PROD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MesApontamentoQtd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesDispositivo" (
    "id" TEXT NOT NULL,
    "recursoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'MODBUS_TCP',
    "host" TEXT,
    "porta" INTEGER,
    "config" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "estadoConexao" TEXT NOT NULL DEFAULT 'DESCONHECIDO',
    "ultimoContatoEm" TIMESTAMP(3),
    "ambiente" TEXT NOT NULL DEFAULT 'PROD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesDispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesCorrecao" (
    "id" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAntes" TEXT,
    "valorDepois" TEXT,
    "motivo" TEXT NOT NULL,
    "userId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MesCorrecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesNesting" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "programa" TEXT,
    "descricao" TEXT,
    "material" TEXT,
    "espessuraMm" DOUBLE PRECISION,
    "recursoId" TEXT,
    "opNumero" TEXT,
    "arquivoRelatorio" TEXT NOT NULL,
    "arquivoMaquina" TEXT,
    "hashRelatorio" TEXT NOT NULL,
    "hashMaquina" TEXT,
    "divergencias" JSONB,
    "ambiente" TEXT NOT NULL DEFAULT 'PROD',
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesNesting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesNestingUnidade" (
    "id" TEXT NOT NULL,
    "nestingId" TEXT NOT NULL,
    "indice" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'BARRA',
    "pecas" INTEGER NOT NULL DEFAULT 0,
    "comprimentoMm" DOUBLE PRECISION,
    "sobraMm" DOUBLE PRECISION,
    "aproveitamento" DOUBLE PRECISION,
    "arquivoMaquina" TEXT,

    CONSTRAINT "MesNestingUnidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesNestingItem" (
    "id" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "qtd" INTEGER NOT NULL DEFAULT 0,
    "ordem" INTEGER,
    "deduzida" BOOLEAN NOT NULL DEFAULT false,
    "pecaConjuntoId" TEXT,
    "opNumero" TEXT,

    CONSTRAINT "MesNestingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS mes."MesAuditoria" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB,
    "ambiente" TEXT NOT NULL DEFAULT 'PROD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MesAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MesSetor_codigo_key" ON mes."MesSetor"("codigo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesSetor_ativo_idx" ON mes."MesSetor"("ativo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesSetor_ordem_idx" ON mes."MesSetor"("ordem");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesRecurso_setorId_idx" ON mes."MesRecurso"("setorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesRecurso_ativo_idx" ON mes."MesRecurso"("ativo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesRecurso_ambiente_idx" ON mes."MesRecurso"("ambiente");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesRecurso_codigoSyneco_idx" ON mes."MesRecurso"("codigoSyneco");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MesRecurso_codigo_ambiente_key" ON mes."MesRecurso"("codigo", "ambiente");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesOperador_ativo_idx" ON mes."MesOperador"("ativo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesOperador_funcionarioId_idx" ON mes."MesOperador"("funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MesOperador_cracha_ambiente_key" ON mes."MesOperador"("cracha", "ambiente");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MesMotivoParada_codigo_key" ON mes."MesMotivoParada"("codigo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesMotivoParada_ativo_idx" ON mes."MesMotivoParada"("ativo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesPresenca_operadorId_status_idx" ON mes."MesPresenca"("operadorId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesPresenca_recursoId_status_idx" ON mes."MesPresenca"("recursoId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesPresenca_abertaEm_idx" ON mes."MesPresenca"("abertaEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesSessao_lotes_idx" ON mes."MesSessao"("lotes");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesSessao_recursoId_status_idx" ON mes."MesSessao"("recursoId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesSessao_opId_idx" ON mes."MesSessao"("opId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesSessao_opNumero_marca_idx" ON mes."MesSessao"("opNumero", "marca");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesSessao_abertaEm_idx" ON mes."MesSessao"("abertaEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesSessao_ambiente_idx" ON mes."MesSessao"("ambiente");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesEvento_recursoId_ocorridoEm_idx" ON mes."MesEvento"("recursoId", "ocorridoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesEvento_sessaoId_idx" ON mes."MesEvento"("sessaoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesEvento_tipo_idx" ON mes."MesEvento"("tipo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesEvento_ocorridoEm_idx" ON mes."MesEvento"("ocorridoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesEvento_ambiente_idx" ON mes."MesEvento"("ambiente");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MesEvento_recursoId_chaveIdem_key" ON mes."MesEvento"("recursoId", "chaveIdem");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesApontamentoQtd_sessaoId_idx" ON mes."MesApontamentoQtd"("sessaoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesApontamentoQtd_ocorridoEm_idx" ON mes."MesApontamentoQtd"("ocorridoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesApontamentoQtd_ambiente_idx" ON mes."MesApontamentoQtd"("ambiente");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MesApontamentoQtd_sessaoId_chaveOperacao_key" ON mes."MesApontamentoQtd"("sessaoId", "chaveOperacao");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesDispositivo_recursoId_idx" ON mes."MesDispositivo"("recursoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesDispositivo_ativo_idx" ON mes."MesDispositivo"("ativo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesCorrecao_entidade_entidadeId_idx" ON mes."MesCorrecao"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesCorrecao_criadoEm_idx" ON mes."MesCorrecao"("criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesNesting_opNumero_idx" ON mes."MesNesting"("opNumero");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesNesting_recursoId_idx" ON mes."MesNesting"("recursoId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MesNesting_hashRelatorio_ambiente_key" ON mes."MesNesting"("hashRelatorio", "ambiente");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MesNestingUnidade_nestingId_indice_key" ON mes."MesNestingUnidade"("nestingId", "indice");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesNestingItem_unidadeId_idx" ON mes."MesNestingItem"("unidadeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesNestingItem_marca_idx" ON mes."MesNestingItem"("marca");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesNestingItem_pecaConjuntoId_idx" ON mes."MesNestingItem"("pecaConjuntoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesAuditoria_entity_entityId_idx" ON mes."MesAuditoria"("entity", "entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesAuditoria_action_idx" ON mes."MesAuditoria"("action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesAuditoria_createdAt_idx" ON mes."MesAuditoria"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MesAuditoria_ambiente_idx" ON mes."MesAuditoria"("ambiente");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesRecurso_setorId_fkey') THEN
    ALTER TABLE mes."MesRecurso" ADD CONSTRAINT "MesRecurso_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES mes."MesSetor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesPresenca_operadorId_fkey') THEN
    ALTER TABLE mes."MesPresenca" ADD CONSTRAINT "MesPresenca_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES mes."MesOperador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesPresenca_recursoId_fkey') THEN
    ALTER TABLE mes."MesPresenca" ADD CONSTRAINT "MesPresenca_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES mes."MesRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesSessao_recursoId_fkey') THEN
    ALTER TABLE mes."MesSessao" ADD CONSTRAINT "MesSessao_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES mes."MesRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesSessao_operadorId_fkey') THEN
    ALTER TABLE mes."MesSessao" ADD CONSTRAINT "MesSessao_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES mes."MesOperador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesEvento_recursoId_fkey') THEN
    ALTER TABLE mes."MesEvento" ADD CONSTRAINT "MesEvento_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES mes."MesRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesEvento_sessaoId_fkey') THEN
    ALTER TABLE mes."MesEvento" ADD CONSTRAINT "MesEvento_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES mes."MesSessao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesEvento_operadorId_fkey') THEN
    ALTER TABLE mes."MesEvento" ADD CONSTRAINT "MesEvento_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES mes."MesOperador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesEvento_motivoId_fkey') THEN
    ALTER TABLE mes."MesEvento" ADD CONSTRAINT "MesEvento_motivoId_fkey" FOREIGN KEY ("motivoId") REFERENCES mes."MesMotivoParada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesApontamentoQtd_sessaoId_fkey') THEN
    ALTER TABLE mes."MesApontamentoQtd" ADD CONSTRAINT "MesApontamentoQtd_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES mes."MesSessao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesDispositivo_recursoId_fkey') THEN
    ALTER TABLE mes."MesDispositivo" ADD CONSTRAINT "MesDispositivo_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES mes."MesRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesNestingUnidade_nestingId_fkey') THEN
    ALTER TABLE mes."MesNestingUnidade" ADD CONSTRAINT "MesNestingUnidade_nestingId_fkey" FOREIGN KEY ("nestingId") REFERENCES mes."MesNesting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesNestingItem_unidadeId_fkey') THEN
    ALTER TABLE mes."MesNestingItem" ADD CONSTRAINT "MesNestingItem_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES mes."MesNestingUnidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


-- CreateTable — a posse da barra de nesting (ver o model MesUnidadeReserva)
CREATE TABLE IF NOT EXISTS mes."MesUnidadeReserva" (
    "id" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL DEFAULT 'PROD',
    "recursoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "operadorId" TEXT,
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liberadaEm" TIMESTAMP(3),
    "liberadaPor" TEXT,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MesUnidadeReserva_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MesUnidadeReserva_unidadeId_ambiente_idx" ON mes."MesUnidadeReserva"("unidadeId", "ambiente");
CREATE INDEX IF NOT EXISTS "MesUnidadeReserva_recursoId_liberadaEm_idx" ON mes."MesUnidadeReserva"("recursoId", "liberadaEm");

-- ⚠⚠ A EXCLUSIVIDADE MORA AQUI, e só aqui ela é garantida: uma barra ABERTA (liberadaEm IS NULL)
-- por ambiente. O Prisma não escreve índice parcial no schema.prisma — por isso ele é SQL.
CREATE UNIQUE INDEX IF NOT EXISTS "MesUnidadeReserva_aberta_unica"
    ON mes."MesUnidadeReserva"("unidadeId", "ambiente") WHERE "liberadaEm" IS NULL;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'mes' AND c.conname = 'MesUnidadeReserva_recursoId_fkey') THEN
    ALTER TABLE mes."MesUnidadeReserva" ADD CONSTRAINT "MesUnidadeReserva_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES mes."MesRecurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
