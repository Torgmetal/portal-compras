// Tabelas e índices da INTELIGÊNCIA FISCAL.
//
// Mesma forma dos outros ensure-*: SQL idempotente rodado no `build`, nada de `prisma db push`
// contra produção.
//
// ⚠⚠ O QUE SÓ EXISTE AQUI: o índice único PARCIAL de `FiscalTipiLinha`. A unicidade de verdade é
// (versão, código, ex) SOMENTE nas linhas de nível NCM — as de hierarquia repetem código entre si
// (`8437.8` aparece uma vez, mas `-- Outras` aparece centenas) e não têm alíquota consultável. O
// Prisma não tem sintaxe para índice parcial no `schema.prisma`, então ele mora neste arquivo,
// como o da Conferência de Peça e o da reserva de barra do MES.
//
// ⚠ Sem essa trava, duas importações concorrentes da mesma versão poderiam gravar o mesmo (NCM, Ex)
// duas vezes com alíquotas diferentes, e a consulta escolheria uma das duas em silêncio.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const sql = [
  `CREATE TABLE IF NOT EXISTS "FiscalFonteArquivo" (
     "id" TEXT PRIMARY KEY,
     "fonte" TEXT NOT NULL,
     "url" TEXT NOT NULL,
     "sha256" TEXT NOT NULL,
     "bytes" INTEGER NOT NULL,
     "contentType" TEXT,
     "atoDeclarado" TEXT,
     "baixadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  // ⚠ Mesmo conteúdo baixado de novo NÃO vira artefato novo — é o que impede a tabela de crescer
  // uma versão por dia (≈4 milhões de linhas/ano sem necessidade).
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalFonteArquivo_fonte_sha256_key" ON "FiscalFonteArquivo"("fonte","sha256")`,
  `CREATE INDEX IF NOT EXISTS "FiscalFonteArquivo_fonte_baixadoEm_idx" ON "FiscalFonteArquivo"("fonte","baixadoEm")`,

  `CREATE TABLE IF NOT EXISTS "FiscalTipiVersao" (
     "id" TEXT PRIMARY KEY,
     "arquivoId" TEXT NOT NULL,
     "parserVersao" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'IMPORTANDO',
     "problemas" JSONB,
     "observadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "aprovadoEm" TIMESTAMP(3),
     "aprovadoPorId" TEXT,
     "vigenciaInicio" TIMESTAMP(3),
     "vigenciaFim" TIMESTAMP(3),
     "vigenciaFundamento" TEXT,
     "totalLinhas" INTEGER NOT NULL DEFAULT 0,
     "totalNcm" INTEGER NOT NULL DEFAULT 0,
     "totalHierarquia" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "FiscalTipiVersao_status_observadoEm_idx" ON "FiscalTipiVersao"("status","observadoEm")`,
  // ⚠⚠ UMA VERSÃO ATIVA POR VEZ, GARANTIDO NO BANCO. A promoção troca a referência ativa numa
  // transação curta; sem esta trava, duas importações concorrentes deixariam DUAS ativas e a
  // consulta passaria a depender de qual linha o Postgres devolvesse primeiro.
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalTipiVersao_uma_ativa" ON "FiscalTipiVersao"("status") WHERE "status" = 'ATIVA'`,

  `CREATE TABLE IF NOT EXISTS "FiscalTipiLinha" (
     "id" TEXT PRIMARY KEY,
     "versaoId" TEXT NOT NULL,
     "ordem" INTEGER NOT NULL,
     "nivel" TEXT NOT NULL,
     "codigo" TEXT NOT NULL,
     "codigoFormatado" TEXT NOT NULL,
     "ex" TEXT NOT NULL DEFAULT '',
     "descricao" TEXT NOT NULL,
     "aliquotaTipo" TEXT NOT NULL,
     "aliquotaValor" DOUBLE PRECISION,
     "aliquotaBruto" TEXT NOT NULL,
     "linhasDeOrigem" INTEGER[]
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalTipiLinha_versaoId_ordem_key" ON "FiscalTipiLinha"("versaoId","ordem")`,
  `CREATE INDEX IF NOT EXISTS "FiscalTipiLinha_versaoId_codigo_idx" ON "FiscalTipiLinha"("versaoId","codigo")`,
  `CREATE INDEX IF NOT EXISTS "FiscalTipiLinha_codigo_ex_idx" ON "FiscalTipiLinha"("codigo","ex")`,
  // ⚠⚠ A TRAVA QUE SÓ O SQL EXPRESSA (ver o cabeçalho).
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalTipiLinha_ncm_unico" ON "FiscalTipiLinha"("versaoId","codigo","ex") WHERE "nivel" = 'NCM'`,
  // ⚠ Busca por DESCRIÇÃO ("estrutura metálica", "guarda-corpo") sem varrer 11 mil linhas.
  `CREATE INDEX IF NOT EXISTS "FiscalTipiLinha_descricao_busca" ON "FiscalTipiLinha" USING GIN (to_tsvector('portuguese', "descricao"))`,

  `CREATE TABLE IF NOT EXISTS "FiscalNcmVersao" (
     "id" TEXT PRIMARY KEY,
     "arquivoId" TEXT NOT NULL,
     "parserVersao" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'IMPORTANDO',
     "atoDeclarado" TEXT,
     "observadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "aprovadoEm" TIMESTAMP(3),
     "totalCodigos" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "FiscalNcmVersao_status_observadoEm_idx" ON "FiscalNcmVersao"("status","observadoEm")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalNcmVersao_uma_ativa" ON "FiscalNcmVersao"("status") WHERE "status" = 'ATIVA'`,

  `CREATE TABLE IF NOT EXISTS "FiscalNcmCodigo" (
     "id" TEXT PRIMARY KEY,
     "versaoId" TEXT NOT NULL,
     "codigo" TEXT NOT NULL,
     "codigoFormatado" TEXT NOT NULL,
     "descricao" TEXT NOT NULL,
     "vigenciaInicio" TIMESTAMP(3),
     "vigenciaFim" TIMESTAMP(3),
     "atoTipo" TEXT,
     "atoNumero" TEXT,
     "atoAno" TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalNcmCodigo_versaoId_codigo_key" ON "FiscalNcmCodigo"("versaoId","codigo")`,
  `CREATE INDEX IF NOT EXISTS "FiscalNcmCodigo_codigo_idx" ON "FiscalNcmCodigo"("codigo")`,
  `CREATE INDEX IF NOT EXISTS "FiscalNcmCodigo_descricao_busca" ON "FiscalNcmCodigo" USING GIN (to_tsvector('portuguese', "descricao"))`,

  `CREATE TABLE IF NOT EXISTS "FiscalSincronizacao" (
     "id" TEXT PRIMARY KEY,
     "fonte" TEXT NOT NULL,
     "disparo" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'RODANDO',
     "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "terminadaEm" TIMESTAMP(3),
     "sha256Visto" TEXT,
     "versaoId" TEXT,
     "mensagem" TEXT,
     "disparadaPorId" TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS "FiscalSincronizacao_fonte_iniciadaEm_idx" ON "FiscalSincronizacao"("fonte","iniciadaEm")`,

  // ⚠ As FKs vão DEPOIS das tabelas, e cada uma num bloco próprio: `ADD CONSTRAINT` não tem
  // `IF NOT EXISTS` no Postgres, então a repetição é tratada como sucesso (42710 = já existe).
];

const fks = [
  [`FiscalTipiVersao`, `FiscalTipiVersao_arquivoId_fkey`, `FOREIGN KEY ("arquivoId") REFERENCES "FiscalFonteArquivo"("id")`],
  [`FiscalTipiLinha`, `FiscalTipiLinha_versaoId_fkey`, `FOREIGN KEY ("versaoId") REFERENCES "FiscalTipiVersao"("id") ON DELETE CASCADE`],
  [`FiscalNcmVersao`, `FiscalNcmVersao_arquivoId_fkey`, `FOREIGN KEY ("arquivoId") REFERENCES "FiscalFonteArquivo"("id")`],
  [`FiscalNcmCodigo`, `FiscalNcmCodigo_versaoId_fkey`, `FOREIGN KEY ("versaoId") REFERENCES "FiscalNcmVersao"("id") ON DELETE CASCADE`],
];

try {
  for (const s of sql) await prisma.$executeRawUnsafe(s);
  for (const [tabela, nome, def] of fks) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${tabela}" ADD CONSTRAINT "${nome}" ${def}`);
    } catch (e) {
      if (!/already exists|42710/i.test(e.message)) throw e;
    }
  }
  console.log("[Fiscal] Tabelas e índices da Inteligência Fiscal prontos.");
} catch (e) {
  console.error("[Fiscal] Não foi possível preparar as tabelas fiscais:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
