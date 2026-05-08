-- CreateTable
CREATE TABLE "ProducaoSemanal" (
    "id" TEXT NOT NULL,
    "semana" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "pesoPrevistoKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pesoRealizadoKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorPrevisto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorRealizado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "opId" TEXT,
    "observacao" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProducaoSemanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FluxoCaixa" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "realizado" BOOLEAN NOT NULL DEFAULT false,
    "dataRealizado" TIMESTAMP(3),
    "opId" TEXT,
    "observacao" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FluxoCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProducaoSemanal_dataInicio_idx" ON "ProducaoSemanal"("dataInicio");

-- CreateIndex
CREATE INDEX "ProducaoSemanal_opId_idx" ON "ProducaoSemanal"("opId");

-- CreateIndex
CREATE UNIQUE INDEX "ProducaoSemanal_semana_opId_key" ON "ProducaoSemanal"("semana", "opId");

-- CreateIndex
CREATE INDEX "FluxoCaixa_data_idx" ON "FluxoCaixa"("data");

-- CreateIndex
CREATE INDEX "FluxoCaixa_tipo_idx" ON "FluxoCaixa"("tipo");

-- CreateIndex
CREATE INDEX "FluxoCaixa_categoria_idx" ON "FluxoCaixa"("categoria");

-- CreateIndex
CREATE INDEX "FluxoCaixa_opId_idx" ON "FluxoCaixa"("opId");

-- AddForeignKey
ALTER TABLE "ProducaoSemanal" ADD CONSTRAINT "ProducaoSemanal_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OP"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluxoCaixa" ADD CONSTRAINT "FluxoCaixa_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OP"("id") ON DELETE SET NULL ON UPDATE CASCADE;
