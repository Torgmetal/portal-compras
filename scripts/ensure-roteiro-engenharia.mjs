// Cria a tabela do roteiro de 6 etapas da obra (F2a do app Torg Engenharia, 16/10/2026). Idempotente.
// ⚠ Escreve no banco: rodar só com o ok do Vitor.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const SQL = `
CREATE TABLE IF NOT EXISTS "RoteiroEtapa" (
  "id" TEXT PRIMARY KEY,
  "opId" TEXT NOT NULL,
  "etapa" INTEGER NOT NULL,
  "fase" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "divergencias" JSONB NOT NULL DEFAULT '[]',
  "observacao" TEXT,
  "aceitoPorId" TEXT,
  "aceitoEm" TIMESTAMP(3),
  "atualizadoPorId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RoteiroEtapa_opId_idx" ON "RoteiroEtapa"("opId");
CREATE UNIQUE INDEX IF NOT EXISTS "RoteiroEtapa_op_etapa_fase" ON "RoteiroEtapa"("opId", "etapa", (COALESCE("fase", -1)))
`;
try {
  for (const stmt of SQL.split(";").map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(stmt);
  console.log("tabela do roteiro da obra ok");
} finally {
  await prisma.$disconnect();
}
