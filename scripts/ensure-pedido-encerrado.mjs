// Coluna `PedidoOmie.encerradoOmieEm` — a marca de que o Omie ENCERROU o pedido de compra.
//
// Matheus (17/09/2026): pedido encerrado no Omie continuava vermelho em `Compras › Prazos das RMs`,
// e pior no Faturamento Direto — o material vai do fornecedor direto à obra, nunca entra NF no
// almoxarifado, então `nQtdeRec` fica 0 e o pedido nunca "chega".
//
// Mesma forma dos outros ensure-*: SQL idempotente, nada de `prisma db push` contra produção.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "PedidoOmie" ADD COLUMN IF NOT EXISTS "encerradoOmieEm" TIMESTAMP(3)`
  );
  // A tela de Prazos filtra por encerrado; o índice parcial cobre só as linhas marcadas,
  // que são a minoria (34 de 284 em 17/09/2026).
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PedidoOmie_encerradoOmieEm_idx"
       ON "PedidoOmie"("encerradoOmieEm") WHERE "encerradoOmieEm" IS NOT NULL`
  );
  console.log("[Compras] Coluna PedidoOmie.encerradoOmieEm pronta.");
} catch (e) {
  console.error("[Compras] Não foi possível criar encerradoOmieEm:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
