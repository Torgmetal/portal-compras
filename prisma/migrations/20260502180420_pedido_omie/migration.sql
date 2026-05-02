-- AlterTable
ALTER TABLE "RMItem" ADD COLUMN     "pedidoOmieId" TEXT;

-- CreateTable
CREATE TABLE "PedidoOmie" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT,
    "fornecedorNome" TEXT NOT NULL,
    "nCodFor" TEXT,
    "cnpj" TEXT,
    "codigoPedido" TEXT,
    "numeroPedido" TEXT,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "faturamentoDireto" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'CRIADO',
    "observacao" TEXT,
    "erroOmie" TEXT,
    "payload" JSONB,
    "resposta" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoOmie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PedidoOmie_cotacaoId_idx" ON "PedidoOmie"("cotacaoId");

-- CreateIndex
CREATE INDEX "PedidoOmie_status_idx" ON "PedidoOmie"("status");

-- CreateIndex
CREATE INDEX "RMItem_pedidoOmieId_idx" ON "RMItem"("pedidoOmieId");

-- AddForeignKey
ALTER TABLE "PedidoOmie" ADD CONSTRAINT "PedidoOmie_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMItem" ADD CONSTRAINT "RMItem_pedidoOmieId_fkey" FOREIGN KEY ("pedidoOmieId") REFERENCES "PedidoOmie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
