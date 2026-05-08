-- CreateTable
CREATE TABLE "OPMedicao" (
    "id" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "numeroPedidoOmie" TEXT NOT NULL,
    "codigoPedidoOmie" TEXT,
    "descricao" TEXT,
    "data" TIMESTAMP(3),
    "valorBruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorLiquido" DOUBLE PRECISION,
    "status" TEXT,
    "etapa" TEXT,
    "qtdItens" INTEGER NOT NULL DEFAULT 0,
    "ultimoSync" TIMESTAMP(3),
    "syncErro" TEXT,
    "payload" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OPMedicao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OPMedicao_opId_idx" ON "OPMedicao"("opId");

-- CreateIndex
CREATE UNIQUE INDEX "OPMedicao_opId_numeroPedidoOmie_key" ON "OPMedicao"("opId", "numeroPedidoOmie");

-- AddForeignKey
ALTER TABLE "OPMedicao" ADD CONSTRAINT "OPMedicao_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OP"("id") ON DELETE CASCADE ON UPDATE CASCADE;
