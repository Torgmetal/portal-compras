// Cria as tabelas do portão de IA da Engenharia (F1 do app Torg Engenharia, 16/10/2026) — mesma forma dos outros
// módulos criados por SQL: nada de `prisma db push` contra a produção. Idempotente.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const SQL = `
CREATE TABLE IF NOT EXISTS "IaAparelho" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "userId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PAREANDO',
  "codigo" TEXT UNIQUE,
  "codigoExpiraEm" TIMESTAMP(3),
  "esperaHash" TEXT NOT NULL UNIQUE,
  "tokenHash" TEXT UNIQUE,
  "aprovadoPorId" TEXT,
  "aprovadoEm" TIMESTAMP(3),
  "revogadoPorId" TEXT,
  "revogadoEm" TIMESTAMP(3),
  "ultimoUsoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IaAparelho_userId_idx" ON "IaAparelho"("userId");
CREATE INDEX IF NOT EXISTS "IaAparelho_status_idx" ON "IaAparelho"("status");
CREATE TABLE IF NOT EXISTS "IaUso" (
  "id" TEXT PRIMARY KEY,
  "aparelhoId" TEXT,
  "userId" TEXT,
  "modelo" TEXT,
  "situacao" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
  "custoUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "custoBrl" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "duracaoMs" INTEGER,
  "pedido" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IaUso_userId_createdAt_idx" ON "IaUso"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "IaUso_aparelhoId_createdAt_idx" ON "IaUso"("aparelhoId", "createdAt");
ALTER TABLE "IaUso" ADD COLUMN IF NOT EXISTS "etapa" TEXT;
ALTER TABLE "IaUso" ADD COLUMN IF NOT EXISTS "conversa" TEXT;
CREATE INDEX IF NOT EXISTS "IaUso_etapa_idx" ON "IaUso"("etapa");
CREATE TABLE IF NOT EXISTS "IaLimite" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "tetoMensalBrl" DOUBLE PRECISION NOT NULL,
  "atualizadoPorId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`;
try {
  for (const stmt of SQL.split(";").map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(stmt);
  console.log("tabelas do portão de IA da Engenharia ok");
} finally {
  await prisma.$disconnect();
}
