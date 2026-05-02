-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'COMERCIAL', 'ENGENHARIA', 'ALMOXARIFADO', 'COMPRAS');

-- CreateEnum
CREATE TYPE "OPStatus" AS ENUM ('ABERTA', 'EM_EXECUCAO', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "RMStatus" AS ENUM ('ABERTA', 'EM_COTACAO', 'COTADA', 'PEDIDO_GERADO', 'CANCELADA');

-- CreateEnum
CREATE TYPE "CotacaoStatus" AS ENUM ('PENDENTE', 'RECEBIDA', 'VENCIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "setor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OP" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "obra" TEXT,
    "descricao" TEXT,
    "status" "OPStatus" NOT NULL DEFAULT 'ABERTA',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OPItem" (
    "id" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "descricao" TEXT NOT NULL,
    "codigoOmie" TEXT,
    "unidade" TEXT NOT NULL,
    "qtdContratada" DOUBLE PRECISION NOT NULL,
    "valorVerba" DOUBLE PRECISION NOT NULL,
    "faturamentoDireto" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,

    CONSTRAINT "OPItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aditivo" (
    "id" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aditivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RM" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'Material',
    "descricao" TEXT NOT NULL,
    "observacao" TEXT,
    "status" "RMStatus" NOT NULL DEFAULT 'ABERTA',
    "categoriaCompra" TEXT,
    "localEstoque" TEXT,
    "createdById" TEXT NOT NULL,
    "setor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RM_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RMItem" (
    "id" TEXT NOT NULL,
    "rmId" TEXT NOT NULL,
    "opItemId" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "qtd" DOUBLE PRECISION NOT NULL,
    "material" TEXT,
    "comprimento" TEXT,
    "largura" TEXT,
    "peso" DOUBLE PRECISION,
    "pesoLinear" DOUBLE PRECISION,
    "codigo" TEXT,
    "tratamento" TEXT,

    CONSTRAINT "RMItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotacao" (
    "id" TEXT NOT NULL,
    "rmId" TEXT NOT NULL,
    "fornecedorNome" TEXT NOT NULL,
    "fornecedorEmail" TEXT,
    "nCodOmie" TEXT,
    "cnpj" TEXT,
    "faturamento" TEXT NOT NULL DEFAULT 'Torg',
    "prazoPagamento" TEXT,
    "observacao" TEXT,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prazoResposta" TIMESTAMP(3),
    "recebidaEm" TIMESTAMP(3),
    "status" "CotacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "token" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoItem" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "rmItemId" TEXT NOT NULL,
    "precoUnit" DOUBLE PRECISION NOT NULL,
    "qtdCotada" DOUBLE PRECISION NOT NULL,
    "qtdProposta" DOUBLE PRECISION,
    "icmsPct" DOUBLE PRECISION,
    "ipiPct" DOUBLE PRECISION,
    "observacao" TEXT,
    "vencedor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CotacaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Envio" (
    "id" TEXT NOT NULL,
    "rmId" TEXT NOT NULL,
    "fornecedorNome" TEXT NOT NULL,
    "fornecedorEmail" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Enviado',

    CONSTRAINT "Envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anexo" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT,
    "rmId" TEXT,
    "nomeArquivo" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OP_numero_key" ON "OP"("numero");

-- CreateIndex
CREATE INDEX "OP_numero_idx" ON "OP"("numero");

-- CreateIndex
CREATE INDEX "OP_status_idx" ON "OP"("status");

-- CreateIndex
CREATE INDEX "OPItem_opId_idx" ON "OPItem"("opId");

-- CreateIndex
CREATE INDEX "Aditivo_opId_idx" ON "Aditivo"("opId");

-- CreateIndex
CREATE UNIQUE INDEX "Aditivo_opId_numero_key" ON "Aditivo"("opId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "RM_numero_key" ON "RM"("numero");

-- CreateIndex
CREATE INDEX "RM_opId_idx" ON "RM"("opId");

-- CreateIndex
CREATE INDEX "RM_status_idx" ON "RM"("status");

-- CreateIndex
CREATE INDEX "RM_createdById_idx" ON "RM"("createdById");

-- CreateIndex
CREATE INDEX "RMItem_rmId_idx" ON "RMItem"("rmId");

-- CreateIndex
CREATE INDEX "RMItem_opItemId_idx" ON "RMItem"("opItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Cotacao_token_key" ON "Cotacao"("token");

-- CreateIndex
CREATE INDEX "Cotacao_rmId_idx" ON "Cotacao"("rmId");

-- CreateIndex
CREATE INDEX "Cotacao_status_idx" ON "Cotacao"("status");

-- CreateIndex
CREATE INDEX "Cotacao_token_idx" ON "Cotacao"("token");

-- CreateIndex
CREATE INDEX "CotacaoItem_cotacaoId_idx" ON "CotacaoItem"("cotacaoId");

-- CreateIndex
CREATE INDEX "CotacaoItem_rmItemId_idx" ON "CotacaoItem"("rmItemId");

-- CreateIndex
CREATE INDEX "Envio_rmId_idx" ON "Envio"("rmId");

-- CreateIndex
CREATE INDEX "Anexo_cotacaoId_idx" ON "Anexo"("cotacaoId");

-- CreateIndex
CREATE INDEX "Anexo_rmId_idx" ON "Anexo"("rmId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "OP" ADD CONSTRAINT "OP_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OPItem" ADD CONSTRAINT "OPItem_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OP"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aditivo" ADD CONSTRAINT "Aditivo_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OP"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aditivo" ADD CONSTRAINT "Aditivo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RM" ADD CONSTRAINT "RM_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OP"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RM" ADD CONSTRAINT "RM_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMItem" ADD CONSTRAINT "RMItem_rmId_fkey" FOREIGN KEY ("rmId") REFERENCES "RM"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMItem" ADD CONSTRAINT "RMItem_opItemId_fkey" FOREIGN KEY ("opItemId") REFERENCES "OPItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotacao" ADD CONSTRAINT "Cotacao_rmId_fkey" FOREIGN KEY ("rmId") REFERENCES "RM"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoItem" ADD CONSTRAINT "CotacaoItem_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoItem" ADD CONSTRAINT "CotacaoItem_rmItemId_fkey" FOREIGN KEY ("rmItemId") REFERENCES "RMItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_rmId_fkey" FOREIGN KEY ("rmId") REFERENCES "RM"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_rmId_fkey" FOREIGN KEY ("rmId") REFERENCES "RM"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
