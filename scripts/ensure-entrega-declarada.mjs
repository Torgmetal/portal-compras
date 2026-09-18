// Colunas da ENTREGA DECLARADA PELO FORNECEDOR — `PedidoOmie.fornecedorEntregaEm` e
// `PedidoOmie.fornecedorNfNumero`.
//
// Matheus (18/09/2026): "na tela de resposta do fornecedor ter a opção de Pedido Entregue e campo
// para informar número da NF".
//
// ⚠⚠ COLUNAS NOVAS, E NÃO `nfNumero`/`dataEntregaReal`. Aqueles são preenchidos pelo cron
// `sync-entregas` a partir da NF de entrada REAL do Omie; escrever neles o que um terceiro sem
// login digitou faria um dado não verificado parecer vindo do ERP. Isto aqui é DECLARAÇÃO a
// conferir, e o nome da coluna diz de quem ela é.
//
// Mesma forma dos outros ensure-*: SQL idempotente, nada de `prisma db push` contra produção.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`ALTER TABLE "PedidoOmie" ADD COLUMN IF NOT EXISTS "fornecedorEntregaEm" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PedidoOmie" ADD COLUMN IF NOT EXISTS "fornecedorNfNumero" TEXT`);
  console.log("[Compras] Colunas de entrega declarada pelo fornecedor prontas.");
} catch (e) {
  console.error("[Compras] Não foi possível criar as colunas de entrega declarada:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
