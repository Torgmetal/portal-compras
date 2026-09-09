import {PrismaClient} from '@prisma/client';
import {RH_VAGAS_BAIXA_SQL} from './rh-vagas-schema.mjs';
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(RH_VAGAS_BAIXA_SQL);
  console.log('[RH] Quantidade preenchida das vagas disponível.');
} catch(e) {
  console.error('[RH] Não foi possível preparar as baixas parciais:', e.message);
  // Não publicar um cliente que consulta uma coluna ainda inexistente.
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
