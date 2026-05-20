// ATENÇÃO: usuário e senha hardcoded — uso interno de desenvolvimento.
// Este usuário será usado como cobaia em testes de TODOS os módulos do portal
// durante a fase de desenvolvimento, e deve ser DESATIVADO ao final do projeto.
// Em scripts futuros que envolvam credenciais reais, ler de env vars (ex: process.env.TEST_USER_PASSWORD).

/**
 * Cria o usuário de teste "teste@torg.com.br" no banco de dados.
 * Uso: node scripts/create-test-user.mjs
 *
 * Idempotente — não faz nada se o usuário já existir.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "teste@torg.com.br";
const SENHA = "Teste123";

async function main() {
  const existe = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (existe) {
    console.log(`✓ Usuário "${EMAIL}" já existe (id: ${existe.id}). Nada a fazer.`);
    return;
  }

  const hash = await bcrypt.hash(SENHA, 10);

  const usuario = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Usuário Teste",
      password: hash,
      role: "COMERCIAL",
      setor: "QA",
      ativo: true,
    },
  });

  console.log("✓ Usuário de teste criado com sucesso.");
  console.log(`   id:    ${usuario.id}`);
  console.log(`   email: ${usuario.email}`);
  console.log(`   role:  ${usuario.role}`);
  console.log(`   senha: ${SENHA}  ← trocar após os testes`);
}

main()
  .catch((e) => {
    console.error("Erro ao criar usuário de teste:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
