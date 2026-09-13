// Cria a tabela das simulações de carga (Expedição/Planejamento) — mesma forma dos outros módulos
// criados por SQL (Análise Crítica, Reuniões): nada de `prisma db push` contra a produção.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const SQL = `
CREATE TABLE IF NOT EXISTS "CargaSimulada" (
  "id" TEXT PRIMARY KEY,
  "opId" TEXT NOT NULL,
  "romaneioPrevioId" TEXT,
  "perfil" TEXT NOT NULL,
  "perfilNome" TEXT,
  "itensHash" TEXT,
  "resumo" JSONB NOT NULL DEFAULT '{}',
  "cargas" JSONB NOT NULL DEFAULT '[]',
  "avisos" JSONB NOT NULL DEFAULT '{}',
  "criadoPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CargaSimulada_romaneioPrevioId_idx" ON "CargaSimulada"("romaneioPrevioId");
CREATE INDEX IF NOT EXISTS "CargaSimulada_opId_idx" ON "CargaSimulada"("opId");
`;
try {
  for (const stmt of SQL.split(";").map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(stmt);
  console.log("[Expedição] Tabela CargaSimulada pronta.");
} catch (e) {
  console.error("[Expedição] Não foi possível criar a tabela:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
