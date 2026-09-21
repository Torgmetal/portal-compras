// Coluna `Cotacao.tipoFrete` — CIF (fornecedor entrega) ou FOB (Torg coleta).
//
// Matheus (17/09/2026): o comprador precisa saber, na tela de Prazos das RMs, o que vai chegar
// sozinho e o que exige programar coleta. Mesma forma dos outros ensure-*: SQL idempotente, nada
// de `prisma db push` contra produção.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "tipoFrete" TEXT`);
  console.log("[Compras] Coluna Cotacao.tipoFrete pronta.");
} catch (e) {
  console.error("[Compras] Não foi possível criar tipoFrete:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
