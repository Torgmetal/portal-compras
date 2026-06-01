import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "locaisQtd" JSONB`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ConfigEstoque" ADD COLUMN IF NOT EXISTS "locaisOmie" JSONB`
  );
  console.log("Colunas locaisQtd e locaisOmie adicionadas com sucesso.");
}

main()
  .catch((e) => console.error("Erro:", e.message))
  .finally(() => prisma.$disconnect());
