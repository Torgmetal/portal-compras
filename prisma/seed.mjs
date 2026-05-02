// Seed inicial — cria usuário admin caso ainda não exista.
// Roda com: npx prisma db seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "vitor@torgmetal.com.br";
  const senhaInicial = "TorgAdmin2026!";

  const existe = await prisma.user.findUnique({ where: { email } });
  if (existe) {
    console.log(`✓ Usuário admin já existe (${email}). Nada a fazer.`);
    return;
  }

  const hash = await bcrypt.hash(senhaInicial, 10);
  await prisma.user.create({
    data: {
      email,
      name: "Vitor Costa",
      password: hash,
      role: "ADMIN",
      setor: "Diretoria",
      ativo: true,
    },
  });

  console.log(`✓ Usuário admin criado.`);
  console.log(`   Email: ${email}`);
  console.log(`   Senha: ${senhaInicial}`);
  console.log(`   ⚠ TROQUE A SENHA na primeira vez que entrar.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
