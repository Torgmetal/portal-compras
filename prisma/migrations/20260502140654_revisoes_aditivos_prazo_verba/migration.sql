-- CreateEnum
CREATE TYPE "SolicitacaoVerbaStatus" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

-- AlterEnum
ALTER TYPE "OPStatus" ADD VALUE 'ATRASADA';

-- AlterTable
ALTER TABLE "OP" ADD COLUMN     "dataFimPrevista" TIMESTAMP(3),
ADD COLUMN     "dataFimReal" TIMESTAMP(3),
ADD COLUMN     "dataInicio" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RMItem" ADD COLUMN     "aditivoItemId" TEXT;

-- CreateTable
CREATE TABLE "Revisao" (
    "id" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revisao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AditivoItem" (
    "id" TEXT NOT NULL,
    "aditivoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "descricao" TEXT NOT NULL,
    "codigoOmie" TEXT,
    "unidade" TEXT NOT NULL,
    "qtdContratada" DOUBLE PRECISION NOT NULL,
    "valorVerba" DOUBLE PRECISION NOT NULL,
    "faturamentoDireto" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,

    CONSTRAINT "AditivoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjustePrazo" (
    "id" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "dataFimAnterior" TIMESTAMP(3) NOT NULL,
    "dataFimNova" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AjustePrazo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoVerba" (
    "id" TEXT NOT NULL,
    "opItemId" TEXT,
    "aditivoItemId" TEXT,
    "valorAtual" DOUBLE PRECISION NOT NULL,
    "valorProposto" DOUBLE PRECISION NOT NULL,
    "justificativa" TEXT NOT NULL,
    "status" "SolicitacaoVerbaStatus" NOT NULL DEFAULT 'PENDENTE',
    "observacaoMaster" TEXT,
    "decididoEm" TIMESTAMP(3),
    "decididoById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitacaoVerba_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Revisao_opId_idx" ON "Revisao"("opId");

-- CreateIndex
CREATE UNIQUE INDEX "Revisao_opId_numero_key" ON "Revisao"("opId", "numero");

-- CreateIndex
CREATE INDEX "AditivoItem_aditivoId_idx" ON "AditivoItem"("aditivoId");

-- CreateIndex
CREATE INDEX "AjustePrazo_opId_idx" ON "AjustePrazo"("opId");

-- CreateIndex
CREATE INDEX "SolicitacaoVerba_opItemId_idx" ON "SolicitacaoVerba"("opItemId");

-- CreateIndex
CREATE INDEX "SolicitacaoVerba_aditivoItemId_idx" ON "SolicitacaoVerba"("aditivoItemId");

-- CreateIndex
CREATE INDEX "SolicitacaoVerba_status_idx" ON "SolicitacaoVerba"("status");

-- CreateIndex
CREATE INDEX "RMItem_aditivoItemId_idx" ON "RMItem"("aditivoItemId");

-- AddForeignKey
ALTER TABLE "Revisao" ADD CONSTRAINT "Revisao_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OP"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revisao" ADD CONSTRAINT "Revisao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AditivoItem" ADD CONSTRAINT "AditivoItem_aditivoId_fkey" FOREIGN KEY ("aditivoId") REFERENCES "Aditivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjustePrazo" ADD CONSTRAINT "AjustePrazo_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OP"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjustePrazo" ADD CONSTRAINT "AjustePrazo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoVerba" ADD CONSTRAINT "SolicitacaoVerba_opItemId_fkey" FOREIGN KEY ("opItemId") REFERENCES "OPItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoVerba" ADD CONSTRAINT "SolicitacaoVerba_aditivoItemId_fkey" FOREIGN KEY ("aditivoItemId") REFERENCES "AditivoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoVerba" ADD CONSTRAINT "SolicitacaoVerba_decididoById_fkey" FOREIGN KEY ("decididoById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoVerba" ADD CONSTRAINT "SolicitacaoVerba_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMItem" ADD CONSTRAINT "RMItem_aditivoItemId_fkey" FOREIGN KEY ("aditivoItemId") REFERENCES "AditivoItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
