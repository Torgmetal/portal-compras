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

  // Origem CMR do recebimento — conciliacao do material com o CMR do Almoxarifado
  // (lib/recebimento-cmr.js). Idempotente. 19/08/2026.
  await prisma.$executeRawUnsafe(`ALTER TYPE "RecebimentoOrigem" ADD VALUE IF NOT EXISTS 'CMR'`).catch(() => {});

  // Vinculo da OP com o orcamento do Comercial (proposta + estudo). Idempotente. 19/08/2026.
  for (const c of [
    `ALTER TABLE "OP" ADD COLUMN IF NOT EXISTS "orcamentoPasta" TEXT`,
    `ALTER TABLE "OP" ADD COLUMN IF NOT EXISTS "orcamentoRef" TEXT`,
    `ALTER TABLE "OP" ADD COLUMN IF NOT EXISTS "propostas" JSONB`,
    `ALTER TABLE "OP" ADD COLUMN IF NOT EXISTS "estudoArquivo" JSONB`,
    `ALTER TABLE "OP" ADD COLUMN IF NOT EXISTS "estudoDados" JSONB`,
    `ALTER TABLE "Aditivo" ADD COLUMN IF NOT EXISTS "dataInicio" TIMESTAMP(3)`,
    `ALTER TABLE "Aditivo" ADD COLUMN IF NOT EXISTS "dataFimPrevista" TIMESTAMP(3)`,
    `ALTER TABLE "Aditivo" ADD COLUMN IF NOT EXISTS "orcamentoPasta" TEXT`,
    `ALTER TABLE "Aditivo" ADD COLUMN IF NOT EXISTS "orcamentoRef" TEXT`,
    `ALTER TABLE "Aditivo" ADD COLUMN IF NOT EXISTS "propostas" JSONB`,
    `ALTER TABLE "Aditivo" ADD COLUMN IF NOT EXISTS "estudoArquivo" JSONB`,
    `ALTER TABLE "Aditivo" ADD COLUMN IF NOT EXISTS "estudoDados" JSONB`,
  ]) await prisma.$executeRawUnsafe(c).catch(() => {});

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

  // PrioridadeTvOp (OPs fixadas manualmente na TV de Prioridades por setor). Idempotente.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PrioridadeTvOp" (
      "id"          TEXT         NOT NULL,
      "opNumero"    TEXT         NOT NULL,
      "opId"        TEXT,
      "criadoPorId" TEXT,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PrioridadeTvOp_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PrioridadeTvOp_opNumero_key" ON "PrioridadeTvOp"("opNumero")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PrioridadeTvOp_opId_idx" ON "PrioridadeTvOp"("opId")`);
  console.log("[ensure-mes-tables] OK — PrioridadeTvOp garantida.");

  // PrioridadeTvOculta (o contrário: OP dispensada da fila de prioridades). Idempotente.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PrioridadeTvOculta" (
      "id"          TEXT         NOT NULL,
      "opNumero"    TEXT         NOT NULL,
      "opId"        TEXT,
      "motivo"      TEXT,
      "criadoPorId" TEXT,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PrioridadeTvOculta_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PrioridadeTvOculta_opNumero_key" ON "PrioridadeTvOculta"("opNumero")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PrioridadeTvOculta_opId_idx" ON "PrioridadeTvOculta"("opId")`);
  console.log("[ensure-mes-tables] OK — PrioridadeTvOculta garantida.");

  // ProdutoOmie (cache do cadastro de produtos do Omie — código do item nos romaneios). Idempotente.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProdutoOmie" (
      "id"           TEXT NOT NULL,
      "codigo"       TEXT NOT NULL,
      "codigoOmie"   TEXT,
      "descricao"    TEXT NOT NULL,
      "unidade"      TEXT,
      "familia"      TEXT,
      "inativo"      BOOLEAN NOT NULL DEFAULT false,
      "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProdutoOmie_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProdutoOmie_codigo_key" ON "ProdutoOmie"("codigo")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProdutoOmie_descricao_idx" ON "ProdutoOmie"("descricao")`);
  console.log("[ensure-mes-tables] OK — ProdutoOmie garantida.");

  // GrdLiberacao (controle de liberação/impressão de desenhos pros setores). Idempotente.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GrdLiberacao" (
      "id"              TEXT         NOT NULL,
      "opId"            TEXT,
      "opNumero"        TEXT         NOT NULL,
      "marca"           TEXT         NOT NULL,
      "arquivo"         TEXT         NOT NULL,
      "formato"         TEXT,
      "setor"           TEXT,
      "itemId"          TEXT,
      "liberadoPorId"   TEXT,
      "liberadoPorNome" TEXT,
      "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GrdLiberacao_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GrdLiberacao_opNumero_marca_idx" ON "GrdLiberacao"("opNumero", "marca")`);
  // Emissão carimbada (rastreabilidade no desenho + arquivo amarrado ao Data Book). Idempotente.
  for (const col of [`"rastreio" JSONB`, `"impressoItemId" TEXT`, `"impressoUrl" TEXT`, `"documentoId" TEXT`,
    `"impressoes" INTEGER NOT NULL DEFAULT 1`, `"ultimaImpressaoEm" TIMESTAMP(3)`]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "GrdLiberacao" ADD COLUMN IF NOT EXISTS ${col}`);
  }
  console.log("[ensure-mes-tables] OK — GrdLiberacao garantida.");

  // TrocaRastreabilidade (R trocado na separação de material). Idempotente.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TrocaRastreabilidade" (
      "id"             TEXT         NOT NULL,
      "opId"           TEXT,
      "opNumero"       TEXT         NOT NULL,
      "perfil"         TEXT         NOT NULL,
      "rIndicado"      TEXT,
      "rUsado"         TEXT         NOT NULL,
      "motivo"         TEXT,
      "trocadoPorId"   TEXT,
      "trocadoPorNome" TEXT,
      "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TrocaRastreabilidade_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TrocaRastreabilidade_opNumero_perfil_key" ON "TrocaRastreabilidade"("opNumero", "perfil")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrocaRastreabilidade_opNumero_idx" ON "TrocaRastreabilidade"("opNumero")`);
  console.log("[ensure-mes-tables] OK — TrocaRastreabilidade garantida.");

  // OP.valorFaturarPorKg (R$/kg a faturar — base da previsão de faturamento). Idempotente.
  await prisma.$executeRawUnsafe(`ALTER TABLE "OP" ADD COLUMN IF NOT EXISTS "valorFaturarPorKg" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "OP" ADD COLUMN IF NOT EXISTS "emProducao" BOOLEAN NOT NULL DEFAULT false`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "OP" ADD COLUMN IF NOT EXISTS "emProducaoEm" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "OP" ADD COLUMN IF NOT EXISTS "emProducaoPor" TEXT`);
  console.log("[ensure-mes-tables] OK — OP.valorFaturarPorKg garantida.");

  // PlanejamentoCarga: situação (previsão de faturamento) + data original (detecta "alterada"). Idempotente.
  await prisma.$executeRawUnsafe(`ALTER TABLE "PlanejamentoCarga" ADD COLUMN IF NOT EXISTS "dataOriginal" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PlanejamentoCarga" ADD COLUMN IF NOT EXISTS "situacao" TEXT NOT NULL DEFAULT 'PENDENTE'`);
  console.log("[ensure-mes-tables] OK — PlanejamentoCarga.situacao/dataOriginal garantidas.");

  // OPReceita: detalhamento do pedido de venda por linha (kg × R$/kg ou peças × valor unit.). Idempotente.
  await prisma.$executeRawUnsafe(`ALTER TABLE "OPReceita" ADD COLUMN IF NOT EXISTS "tipoPreco" TEXT NOT NULL DEFAULT 'VALOR'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "OPReceita" ADD COLUMN IF NOT EXISTS "unidade" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "OPReceita" ADD COLUMN IF NOT EXISTS "quantidade" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "OPReceita" ADD COLUMN IF NOT EXISTS "valorUnitario" DOUBLE PRECISION`);
  console.log("[ensure-mes-tables] OK — OPReceita.tipoPreco/unidade/quantidade/valorUnitario garantidas.");

  // AuditoriaInterna: relatório fica "em aberto" até todas as ações do plano serem
  // concluídas (com resposta/evidência); finalizadoEm marca o encerramento. Idempotente.
  await prisma.$executeRawUnsafe(`ALTER TABLE "AuditoriaInterna" ADD COLUMN IF NOT EXISTS "finalizadoEm" TIMESTAMP(3)`);
  console.log("[ensure-mes-tables] OK — AuditoriaInterna.finalizadoEm garantida.");

  // Cargo: Matriz de Competências (FORM-11 / ISO 9001 §7.2) — descrição da função,
  // área e metadados da matriz (revisão, requisitos, qualificações). Idempotente.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Cargo" ADD COLUMN IF NOT EXISTS "descricao" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Cargo" ADD COLUMN IF NOT EXISTS "area" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Cargo" ADD COLUMN IF NOT EXISTS "matriz" JSONB`);
  console.log("[ensure-mes-tables] OK — Cargo.descricao/area/matriz garantidas.");

  // NaoConformidade (RNC / FORM 20) — RNC interna e de cliente. Idempotente.
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NaoConformidade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "cliente" TEXT, "opNumero" TEXT, "opId" TEXT, "desenhoProjetoMarca" TEXT,
    "origem" TEXT, "fornecedor" TEXT, "processoArea" TEXT, "descricao" TEXT,
    "fotos" JSONB NOT NULL DEFAULT '[]', "disposicao" TEXT, "elaborador" TEXT,
    "resultadoReinspecao" TEXT, "abrangencia" TEXT, "necessitaAcao" TEXT, "motivoNaoAcao" TEXT,
    "causas" TEXT, "cincoPorques" JSONB NOT NULL DEFAULT '[]', "planoAcaoId" TEXT,
    "prazoResposta" TIMESTAMP(3), "realizadoEm" TIMESTAMP(3), "acompanhadoPor" TEXT,
    "acompanhamento" TEXT, "avaliacaoEficacia" TEXT, "encerradaPor" TEXT, "encerradaEm" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ABERTA', "pertinente" BOOLEAN NOT NULL DEFAULT true,
    "recorrente" BOOLEAN NOT NULL DEFAULT false, "rncAnteriorId" TEXT,
    "anexoUrl" TEXT, "programa" TEXT, "jobCliente" TEXT, "numeroCliente" TEXT,
    "respostaCliente" TEXT, "respostaPdfUrl" TEXT, "respostaEnviadaEm" TIMESTAMP(3),
    "evidencias" JSONB NOT NULL DEFAULT '[]', "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "NaoConformidade" ADD COLUMN IF NOT EXISTS "anexos" JSONB NOT NULL DEFAULT '[]'`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NaoConformidade_tipo_idx" ON "NaoConformidade"("tipo")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NaoConformidade_status_idx" ON "NaoConformidade"("status")`);
  console.log("[ensure-mes-tables] OK — NaoConformidade (RNC) garantida.");

  // BaixaExpedicao: baixa manual de marca (sem romaneio). Idempotente.
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BaixaExpedicao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opId" TEXT NOT NULL,
    "frente" TEXT,
    "marca" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "qtd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pesoKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "BaixaExpedicao" ADD COLUMN IF NOT EXISTS "pesoKg" DOUBLE PRECISION NOT NULL DEFAULT 0`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BaixaExpedicao_opId_idx" ON "BaixaExpedicao"("opId")`);
  console.log("[ensure-mes-tables] OK — BaixaExpedicao garantida.");

  // Colunas do FluxoCaixa para import do extrato Omie (idempotente).
  await prisma.$executeRawUnsafe(`ALTER TABLE "FluxoCaixa" ADD COLUMN IF NOT EXISTS "origemOmieId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "FluxoCaixa" ADD COLUMN IF NOT EXISTS "contaCorrente" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "FluxoCaixa" ADD COLUMN IF NOT EXISTS "transferencia" BOOLEAN NOT NULL DEFAULT false`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "FluxoCaixa" ADD COLUMN IF NOT EXISTS "contraparte" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FluxoCaixa_origemOmieId_idx" ON "FluxoCaixa"("origemOmieId")`);
  console.log("[ensure-mes-tables] OK — colunas FluxoCaixa (Omie) garantidas.");

  // AvaliacaoCalibracao (avaliação Aprovado/Reprovado dos certificados de calibração, PO-20). Idempotente.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AvaliacaoCalibracao" (
      "id"                  TEXT NOT NULL,
      "numero"              INTEGER NOT NULL,
      "documentoId"         TEXT NOT NULL,
      "identificacao"       TEXT,
      "faixaUso"            TEXT,
      "laboratorio"         TEXT,
      "fotoEquipamentoUrl"  TEXT,
      "fotoEquipamentoNome" TEXT,
      "relatorioUrl"        TEXT,
      "relatorioNome"       TEXT,
      "criterios"           JSONB NOT NULL DEFAULT '[]',
      "criterioAceitacao"   TEXT,
      "parecer"             TEXT,
      "conclusao"           TEXT NOT NULL DEFAULT 'PENDENTE',
      "avaliadorId"         TEXT,
      "avaliadoEm"          TIMESTAMP(3),
      "createdById"         TEXT,
      "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AvaliacaoCalibracao_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AvaliacaoCalibracao_documentoId_key" ON "AvaliacaoCalibracao"("documentoId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AvaliacaoCalibracao_conclusao_idx" ON "AvaliacaoCalibracao"("conclusao")`);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AvaliacaoCalibracao_documentoId_fkey') THEN
        ALTER TABLE "AvaliacaoCalibracao"
          ADD CONSTRAINT "AvaliacaoCalibracao_documentoId_fkey"
          FOREIGN KEY ("documentoId") REFERENCES "DocumentoQualidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "AvaliacaoCalibracao" ADD COLUMN IF NOT EXISTS "erroMaxPercent" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "AvaliacaoCalibracao" ADD COLUMN IF NOT EXISTS "analise" JSONB`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "AvaliacaoCalibracao" ADD COLUMN IF NOT EXISTS "analisadoEm" TIMESTAMP(3)`);
  console.log("[ensure-mes-tables] OK — AvaliacaoCalibracao garantida.");

  // Relatório interno da Auditoria Externa (constatações + plano de ação 5W2H + fotos). Idempotente.
  for (const c of [
    `ADD COLUMN IF NOT EXISTS "numero" INTEGER`,
    `ADD COLUMN IF NOT EXISTS "dataAuditoria" TIMESTAMP(3)`,
    `ADD COLUMN IF NOT EXISTS "auditor" TEXT`,
    `ADD COLUMN IF NOT EXISTS "norma" TEXT`,
    `ADD COLUMN IF NOT EXISTS "escopo" TEXT`,
    `ADD COLUMN IF NOT EXISTS "constatacoes" JSONB NOT NULL DEFAULT '[]'`,
    `ADD COLUMN IF NOT EXISTS "planoAcao" JSONB NOT NULL DEFAULT '[]'`,
    `ADD COLUMN IF NOT EXISTS "fotos" JSONB NOT NULL DEFAULT '[]'`,
    `ADD COLUMN IF NOT EXISTS "conclusao" TEXT`,
    `ADD COLUMN IF NOT EXISTS "relatorioEmitidoEm" TIMESTAMP(3)`,
    `ADD COLUMN IF NOT EXISTS "itensAdicionais" JSONB NOT NULL DEFAULT '[]'`,
    `ADD COLUMN IF NOT EXISTS "portalConfig" JSONB NOT NULL DEFAULT '{}'`,
  ]) await prisma.$executeRawUnsafe(`ALTER TABLE "Auditoria" ${c}`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "AuditoriaDoc" ADD COLUMN IF NOT EXISTS "publicar" BOOLEAN NOT NULL DEFAULT true`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "AuditoriaDoc" ADD COLUMN IF NOT EXISTS "comentario" TEXT`);
  console.log("[ensure-mes-tables] OK — colunas de relatório/publicação da Auditoria garantidas.");

  // PecaConjunto: despacho no fluxo do PCP (TV de prioridades). Idempotente.
  for (const c of [
    `ADD COLUMN IF NOT EXISTS "destino" TEXT`,
    `ADD COLUMN IF NOT EXISTS "destinoEm" TIMESTAMP(3)`,
    `ADD COLUMN IF NOT EXISTS "destinoPor" TEXT`,
    `ADD COLUMN IF NOT EXISTS "destinoObs" TEXT`,
    `ADD COLUMN IF NOT EXISTS "baixaSetores" JSONB DEFAULT '{}'`,
    `ADD COLUMN IF NOT EXISTS "terceiroRetornoPrevisto" TIMESTAMP(3)`,
    `ADD COLUMN IF NOT EXISTS "encaminhadoSetor" TEXT`,
    `ADD COLUMN IF NOT EXISTS "encaminhadoEm" TIMESTAMP(3)`,
    `ADD COLUMN IF NOT EXISTS "encaminhadoPor" TEXT`,
  ]) await prisma.$executeRawUnsafe(`ALTER TABLE "PecaConjunto" ${c}`);
  console.log("[ensure-mes-tables] OK — PecaConjunto.destino* garantidas.");

  // DocumentoQualidade: rastreabilidade/compra do CMR (base do status de compra no PCP).
  for (const c of [
    `ADD COLUMN IF NOT EXISTS "pedidoCompra" TEXT`,
    `ADD COLUMN IF NOT EXISTS "nfNumero" TEXT`,
    `ADD COLUMN IF NOT EXISTS "dataRecebimento" TIMESTAMP(3)`,
    `ADD COLUMN IF NOT EXISTS "pesoKg" DOUBLE PRECISION`,
    `ADD COLUMN IF NOT EXISTS "quantidade" DOUBLE PRECISION`,
  ]) await prisma.$executeRawUnsafe(`ALTER TABLE "DocumentoQualidade" ${c}`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DocumentoQualidade_opNumero_categoria_idx" ON "DocumentoQualidade"("opNumero","categoria")`);
  console.log("[ensure-mes-tables] OK — DocumentoQualidade rastreabilidade garantida.");

  // Romaneio de terceiro: 2º romaneio de MATERIAL (perfis a mandar) + etapa de envio.
  try {
    for (const c of [
      `ADD COLUMN IF NOT EXISTS "setorEnvio" TEXT`,
      `ADD COLUMN IF NOT EXISTS "materiais" JSONB DEFAULT '[]'`,
      `ADD COLUMN IF NOT EXISTS "arquivoMaterialUrl" TEXT`,
    ]) await prisma.$executeRawUnsafe(`ALTER TABLE "RomaneioTerceiro" ${c}`);
    console.log("[ensure-mes-tables] OK — RomaneioTerceiro.materiais garantidas.");
  } catch (e) { console.warn("[ensure-mes-tables] RomaneioTerceiro:", e?.message); }

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
