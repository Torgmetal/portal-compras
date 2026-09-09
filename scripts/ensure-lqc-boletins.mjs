import { PrismaClient } from "@prisma/client";
const prisma=new PrismaClient();
async function main(){
  // LQC: campos aditivos. Falha explícita impede publicar código sem as colunas necessárias.
  for (const sql of [
    'ALTER TABLE "Fornecedor" ADD COLUMN IF NOT EXISTS "fabricanteTinta" TEXT',
    'ALTER TABLE "ProdutoTinta" ADD COLUMN IF NOT EXISTS "boletimRevisao" TEXT',
    'ALTER TABLE "ProdutoTinta" ADD COLUMN IF NOT EXISTS "boletimData" TEXT',
    'ALTER TABLE "ProdutoTinta" ADD COLUMN IF NOT EXISTS "conferidoEm" TIMESTAMP(3)',
    'ALTER TABLE "ProdutoTinta" ADD COLUMN IF NOT EXISTS "conferidoPorNome" TEXT',
    'ALTER TABLE "ProdutoTinta" ADD COLUMN IF NOT EXISTS "historicoBoletins" JSONB',
    'ALTER TABLE "CotacaoEstudoFornecedor" ADD COLUMN IF NOT EXISTS "snapshot" JSONB',
  ]) await prisma.$executeRawUnsafe(sql);

}
main().catch(e=>{console.error("[ensure-lqc-boletins]",e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
