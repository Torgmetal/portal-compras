-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'FINANCEIRO';

-- CreateTable
CREATE TABLE "Romaneio" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "opId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "pesoRealKg" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "observacao" TEXT,
    "valorPorKg" DOUBLE PRECISION,
    "valorTotal" DOUBLE PRECISION,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Romaneio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Romaneio_opId_idx" ON "Romaneio"("opId");

-- CreateIndex
CREATE INDEX "Romaneio_data_idx" ON "Romaneio"("data");

-- AddForeignKey
ALTER TABLE "Romaneio" ADD CONSTRAINT "Romaneio_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OP"("id") ON DELETE SET NULL ON UPDATE CASCADE;
