// Classifica uma única vez. Nunca reclassifica um book ao reabrir revisão.
import { prisma, prismaDirect } from '../lib/prisma.js';
import { templateInicial } from '../lib/databook-template.js';
try {
  const resultado = await prismaDirect.$transaction(async tx => {
    await tx.$executeRawUnsafe(`ALTER TABLE "DataBookQualidade" ADD COLUMN IF NOT EXISTS "templateVisual" TEXT`);
    const books = await tx.$queryRawUnsafe(`SELECT b.id, b.status, b."emitidoEm", b.revisao,
      EXISTS(SELECT 1 FROM "DataBookRevisao" r WHERE r."dataBookId"=b.id) AS "teveRevisao",
      EXISTS(SELECT 1 FROM "DataBookAssinatura" a WHERE a."dataBookId"=b.id AND a."assinadoEm" IS NOT NULL) AS "teveAssinatura"
      FROM "DataBookQualidade" b WHERE b."templateVisual" IS NULL FOR UPDATE`);
    const contagem = { LEGADO: 0, TORG_2026: 0 };
    for (const book of books) {
      const modelo = templateInicial(book);
      await tx.$executeRawUnsafe(`UPDATE "DataBookQualidade" SET "templateVisual"=$1 WHERE id=$2 AND "templateVisual" IS NULL`, modelo, book.id);
      await tx.auditLog.create({data:{action:'DEFINIR_TEMPLATE_DATABOOK',entity:'DataBookQualidade',entityId:book.id,diff:{antes:null,depois:modelo,motivo:'Adoção do padrão Torg apenas para obras sem emissão anterior'}}});
      contagem[modelo]++;
    }
    await tx.$executeRawUnsafe(`ALTER TABLE "DataBookQualidade" ALTER COLUMN "templateVisual" SET DEFAULT 'TORG_2026', ALTER COLUMN "templateVisual" SET NOT NULL`);
    return contagem;
  }, {timeout:60000});
  console.log('[Data book] Templates definidos:', resultado);
} catch(e) {
  console.error('[Data book] Falha ao preparar template:',e.message);
  process.exitCode=1;
} finally {
  await Promise.all([prismaDirect.$disconnect(), prisma.$disconnect()]);
}
