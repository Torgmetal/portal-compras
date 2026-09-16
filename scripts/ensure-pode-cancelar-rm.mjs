// Coluna `User.podeCancelarRM` — permissão por pessoa para cancelar uma RM sem ser ADMIN
// (Matheus, 16/09/2026: a conta compras@torg.com.br precisava cancelar RMs criadas erradas).
// Mesma forma dos outros ensure-*: nada de `prisma db push` contra produção.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "podeCancelarRM" BOOLEAN NOT NULL DEFAULT false`);
  console.log("[Admin] Coluna User.podeCancelarRM pronta.");
} catch (e) {
  console.error("[Admin] Não foi possível criar a coluna podeCancelarRM:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
