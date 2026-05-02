-- CreateEnum
CREATE TYPE "RMItemStatus" AS ENUM ('PENDENTE', 'EM_COTACAO', 'COTADO', 'PEDIDO_GERADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "RMItem" ADD COLUMN     "canceladoEm" TIMESTAMP(3),
ADD COLUMN     "canceladoMotivo" TEXT,
ADD COLUMN     "status" "RMItemStatus" NOT NULL DEFAULT 'PENDENTE';

-- CreateIndex
CREATE INDEX "RMItem_status_idx" ON "RMItem"("status");
