// Coluna `CronHeartbeat.travadoAte` — o arrendamento que impede um cron de atropelar a si mesmo.
// Ver `lib/cron-trava.js` (e por que `pg_advisory_lock` não serve com o pooler do Neon).
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`ALTER TABLE "CronHeartbeat" ADD COLUMN IF NOT EXISTS "travadoAte" TIMESTAMP(3)`);
  console.log("[Crons] Coluna CronHeartbeat.travadoAte pronta.");
} catch (e) {
  console.error("[Crons] Não foi possível criar travadoAte:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
