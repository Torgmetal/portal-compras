-- Adiciona coluna 'data' (dia especifico) em ProducaoSemanal
-- Migracao: lancamentos antes eram por semana; agora sao por dia.
-- Pra dados existentes, copia 'dataInicio' (segunda da semana) como 'data'.

-- 1. Drop unique constraint antiga (semana, opId)
ALTER TABLE "ProducaoSemanal" DROP CONSTRAINT IF EXISTS "ProducaoSemanal_semana_opId_key";

-- 2. Adiciona coluna 'data' nullable temporariamente
ALTER TABLE "ProducaoSemanal" ADD COLUMN "data" TIMESTAMP(3);

-- 3. Backfill: copia dataInicio pra data nas linhas existentes
UPDATE "ProducaoSemanal" SET "data" = "dataInicio" WHERE "data" IS NULL;

-- 4. Faz a coluna NOT NULL
ALTER TABLE "ProducaoSemanal" ALTER COLUMN "data" SET NOT NULL;

-- 5. Drop indice antigo de dataInicio (substituido por data)
DROP INDEX IF EXISTS "ProducaoSemanal_dataInicio_idx";

-- 6. Cria novos indices
CREATE INDEX "ProducaoSemanal_data_idx" ON "ProducaoSemanal"("data");
CREATE INDEX "ProducaoSemanal_semana_idx" ON "ProducaoSemanal"("semana");

-- 7. Cria nova unique constraint (data, opId)
-- Atencao: se houver duplicatas em (data, opId) nas linhas existentes,
-- esse INSERT vai falhar. Como antes era unique por (semana, opId), e
-- backfill data = dataInicio (que e o mesmo pra todas linhas da mesma
-- semana), nao deveria ter conflito.
CREATE UNIQUE INDEX "ProducaoSemanal_data_opId_key" ON "ProducaoSemanal"("data", "opId");
