// Cria a tabela da Análise Crítica de Projeto (PO-13) — mesma forma dos outros módulos
// criados por SQL (Reuniões, Relatórios): nada de `prisma db push` contra a produção.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const SQL = `
CREATE TABLE IF NOT EXISTS "AnaliseCriticaProjeto" (
  "id" TEXT PRIMARY KEY,
  "opId" TEXT NOT NULL UNIQUE,
  "opNumero" TEXT NOT NULL,
  "revisao" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'EM_ANALISE',
  "responsavelNome" TEXT,
  "responsavelId" TEXT,
  "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aprovadoPorNome" TEXT,
  "aprovadoPorId" TEXT,
  "aprovadoEm" TIMESTAMP(3),
  "entradas" JSONB NOT NULL DEFAULT '[]',
  "requisitos" JSONB NOT NULL DEFAULT '[]',
  "areas" JSONB NOT NULL DEFAULT '[]',
  "riscos" JSONB NOT NULL DEFAULT '[]',
  "saidas" JSONB NOT NULL DEFAULT '[]',
  "comentarios" JSONB NOT NULL DEFAULT '[]',
  "reunioes" JSONB NOT NULL DEFAULT '[]',
  "acoes" JSONB NOT NULL DEFAULT '[]',
  "historico" JSONB NOT NULL DEFAULT '[]',
  "form08Url" TEXT,
  "form08EmitidoEm" TIMESTAMP(3),
  "sharepointPath" TEXT,
  "sharepointEm" TIMESTAMP(3),
  "criadoPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AnaliseCriticaProjeto_opNumero_idx" ON "AnaliseCriticaProjeto"("opNumero");
`;
try {
  for (const stmt of SQL.split(";").map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(stmt);
  console.log("[Engenharia] Tabela AnaliseCriticaProjeto pronta.");
} catch (e) {
  console.error("[Engenharia] Não foi possível criar a tabela:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
