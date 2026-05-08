-- CreateTable
CREATE TABLE "OPReceita" (
    "id" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "cfop" TEXT,
    "codigoServico" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "icmsPct" DOUBLE PRECISION,
    "ipiPct" DOUBLE PRECISION,
    "pisPct" DOUBLE PRECISION,
    "cofinsPct" DOUBLE PRECISION,
    "issPct" DOUBLE PRECISION,
    "irrfPct" DOUBLE PRECISION,
    "csllPct" DOUBLE PRECISION,
    "observacao" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OPReceita_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OPReceita_opId_idx" ON "OPReceita"("opId");

-- CreateIndex
CREATE INDEX "OPReceita_categoria_idx" ON "OPReceita"("categoria");

-- AddForeignKey
ALTER TABLE "OPReceita" ADD CONSTRAINT "OPReceita_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OP"("id") ON DELETE CASCADE ON UPDATE CASCADE;
