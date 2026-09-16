// Tabela `AcompanhamentoPedido` — a linha do tempo do pedido depois que ele vai pro Omie
// (Matheus, 16/09/2026: liberado para coleta / encaminhado para obra / material recebido, com
// data, para comparar com o prazo estimado). Mesma forma dos outros ensure-*: nada de
// `prisma db push` contra produção.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AcompanhamentoPedido" (
      "id"              TEXT PRIMARY KEY,
      "pedidoId"        TEXT NOT NULL,
      "etapa"           TEXT NOT NULL,
      "data"            TIMESTAMP(3) NOT NULL,
      "observacao"      TEXT,
      "registradoPorId" TEXT,
      "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  // ⚠ ON DELETE CASCADE no pedido: apagar um pedido tem de levar o acompanhamento junto, senão
  // a exclusão quebra na FK. Já o autor é SET NULL — desligar um usuário não pode apagar o
  // registro de que a etapa aconteceu.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "AcompanhamentoPedido"
        ADD CONSTRAINT "AcompanhamentoPedido_pedidoId_fkey"
        FOREIGN KEY ("pedidoId") REFERENCES "PedidoOmie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "AcompanhamentoPedido"
        ADD CONSTRAINT "AcompanhamentoPedido_registradoPorId_fkey"
        FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AcompanhamentoPedido_pedidoId_data_idx" ON "AcompanhamentoPedido"("pedidoId", "data")`);
  console.log("[Compras] Tabela AcompanhamentoPedido pronta.");
} catch (e) {
  console.error("[Compras] Não foi possível criar AcompanhamentoPedido:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
