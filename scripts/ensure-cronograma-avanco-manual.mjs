// Coluna `CronogramaTarefa.avancoManual` — o percentual digitado à mão prevalece sobre os sincronismos
// (Syneco na Fabricação, CMR em Suprimentos). Mesma forma dos outros ensure-*: nada de `prisma db push`.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`ALTER TABLE "CronogramaTarefa" ADD COLUMN IF NOT EXISTS "avancoManual" BOOLEAN NOT NULL DEFAULT false`);
  console.log("[Planejamento] Coluna CronogramaTarefa.avancoManual pronta.");
} catch (e) {
  console.error("[Planejamento] Não foi possível criar a coluna avancoManual:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
