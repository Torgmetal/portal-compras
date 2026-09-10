// DÁ UMA SENHA A UM USUÁRIO **DO LABORATÓRIO**, para conseguir abrir as telas no `npm run dev`.
//
//   MES_LAB_URL=postgresql://torg:torg@localhost:55432/torg_mes_lab \
//   node scripts/mes-lab/acesso.mjs <email> <senha>
//
// ⚠⚠ ISTO SÓ EXISTE PORQUE O IMPORT APAGA AS SENHAS DE PROPÓSITO. `importar.mjs` substitui todo
// hash por "LABORATORIO-SEM-SENHA" (hash não é dado realista, é credencial — ver §10.3 do doc), e o
// efeito colateral é que ninguém consegue logar no laboratório. Este script devolve o acesso a UMA
// conta, com uma senha que você escolhe e que só vale nesta máquina.
//
// ⚠ A TRAVA DE DESTINO VALE AQUI TAMBÉM, e é o ponto mais importante do arquivo: um script que
// escreve hash de senha apontado para o Neon por engano trocaria a senha de alguém em PRODUÇÃO.
// `exigirLaboratorio` recusa qualquer host que não seja esta máquina.
//
// ⚠ A senha vai por argumento e fica no histórico do shell. Tudo bem para um banco descartável na
// sua máquina; não reuse aqui uma senha que você use em outro lugar.

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { exigirLaboratorio } from "./destino.mjs";

let LAB;
try { LAB = exigirLaboratorio(process.env.MES_LAB_URL); }
catch (e) { console.error(`\n✗ ${e.message}\n`); process.exit(1); }

const [email, senha] = process.argv.slice(2);
if (!email || !senha) {
  console.error("\n✗ Uso: node scripts/mes-lab/acesso.mjs <email> <senha>\n");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: LAB } } });

const alvo = await prisma.user.findUnique({ where: { email }, select: { id: true, nome: true, name: true, tipo: true } })
  .catch(() => prisma.user.findUnique({ where: { email }, select: { id: true, name: true, tipo: true } }));

if (!alvo) {
  const contas = await prisma.user.findMany({ where: { tipo: "ADMIN" }, select: { email: true }, take: 10 });
  console.error(`\n✗ Não achei ${email} no laboratório. ADMINs disponíveis:\n  ${contas.map((c) => c.email).join("\n  ")}\n`);
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.user.update({
  where: { email },
  data: { password: await bcrypt.hash(senha, 10), deveTrocarSenha: false, tentativasFalhas: 0, bloqueadoAte: null },
});

console.log(`\n✓ Acesso liberado no laboratório para ${alvo.name} (${alvo.tipo}).`);
console.log(`  Rode o dev apontando para o laboratório e entre com ${email}:\n`);
console.log(`  DATABASE_URL=$MES_LAB_URL DIRECT_URL=$MES_LAB_URL npm run dev\n`);
await prisma.$disconnect();
