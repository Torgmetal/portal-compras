CREATE TABLE "PadraoInspecao" (
  "id" TEXT NOT NULL,
  "opNumero" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "campo" TEXT NOT NULL,
  "valor" TEXT,
  "relatorioId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PadraoInspecao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PadraoInspecao_opNumero_tipo_campo_key" ON "PadraoInspecao"("opNumero", "tipo", "campo");
