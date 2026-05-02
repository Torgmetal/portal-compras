/*
  Warnings:

  - Added the required column `categoria` to the `AditivoItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `categoria` to the `OPItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ItemTipo" AS ENUM ('VERBA', 'ESTRUTURA', 'AREA', 'ALUGUEL', 'GENERICO');

-- AlterTable
ALTER TABLE "AditivoItem" ADD COLUMN     "capacidade" TEXT,
ADD COLUMN     "categoria" TEXT NOT NULL,
ADD COLUMN     "meses" INTEGER,
ADD COLUMN     "tipo" "ItemTipo" NOT NULL DEFAULT 'VERBA',
ADD COLUMN     "valorPorMes" DOUBLE PRECISION,
ALTER COLUMN "unidade" DROP NOT NULL,
ALTER COLUMN "qtdContratada" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OPItem" ADD COLUMN     "capacidade" TEXT,
ADD COLUMN     "categoria" TEXT NOT NULL,
ADD COLUMN     "meses" INTEGER,
ADD COLUMN     "tipo" "ItemTipo" NOT NULL DEFAULT 'VERBA',
ADD COLUMN     "valorPorMes" DOUBLE PRECISION,
ALTER COLUMN "unidade" DROP NOT NULL,
ALTER COLUMN "qtdContratada" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AditivoItem_categoria_idx" ON "AditivoItem"("categoria");

-- CreateIndex
CREATE INDEX "OPItem_categoria_idx" ON "OPItem"("categoria");
