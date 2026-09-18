// Colunas da PROPOSTA DE PRAZO DO FORNECEDOR — `PedidoOmie.prazoProposto*`.
//
// Matheus (18/09/2026): "sim, o Compras precisa aprovar a alteração depois". Até aqui, a data que
// o fornecedor digitava no link público virava `prazoEntregaPrevisto` na hora — um terceiro sem
// login tirava o pedido do vermelho sozinho.
//
// ⚠⚠ A PROPOSTA MORA EM COLUNAS PRÓPRIAS, e é só o que a rota pública escreve. Quem efetiva é
// `POST /api/compras/prazos-rm/prazo-proposto`, com sessão. Mesma lição de
// `fornecedorEntregaEm`: declaração de terceiro não é fato do portal.
//
// ⚠⚠ `prazoPropostoId` É O IDENTIFICADOR DA PROPOSTA, e existe porque comparar só a data não
// basta (achado do Codex): mesma data com outro motivo, e o vaivém A→B→A, passariam por
// "é a mesma proposta que eu estava vendo". A tela devolve o id que leu; divergiu, 409.
//
// Mesma forma dos outros ensure-*: SQL idempotente, nada de `prisma db push` contra produção.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`ALTER TABLE "PedidoOmie" ADD COLUMN IF NOT EXISTS "prazoProposto" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PedidoOmie" ADD COLUMN IF NOT EXISTS "prazoPropostoEm" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PedidoOmie" ADD COLUMN IF NOT EXISTS "prazoPropostoMotivo" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PedidoOmie" ADD COLUMN IF NOT EXISTS "prazoPropostoId" TEXT`);
  console.log("[Compras] Colunas de proposta de prazo do fornecedor prontas.");
} catch (e) {
  console.error("[Compras] Não foi possível criar as colunas de proposta de prazo:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
