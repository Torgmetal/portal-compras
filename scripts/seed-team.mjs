// Cria os usuarios da equipe da Torg.
// Roda uma vez com:  node scripts/seed-team.mjs
// Usa DATABASE_URL do .env.local
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// senha = primeiro nome (capitalize) + "@2026!"
function senhaPara(emailLocal) {
  const base = emailLocal.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1) + "@2026!";
}

const usuarios = [
  { email: "vitor@torg.com.br",        name: "Vitor Costa",   role: "ADMIN",        setor: "Diretoria"  },
  { email: "fabrine@torg.com.br",      name: "Fabrine",       role: "ADMIN",        setor: "Diretoria"  },
  { email: "caio@torg.com.br",         name: "Caio",          role: "ADMIN",        setor: "Diretoria"  },
  { email: "matheus@torg.com.br",      name: "Matheus",       role: "ADMIN",        setor: "Diretoria"  },
  { email: "guilherme@torg.com.br",    name: "Guilherme",     role: "ADMIN",        setor: "Diretoria"  },
  { email: "comercial@torg.com.br",    name: "Comercial",     role: "COMERCIAL",    setor: "Comercial"  },
  { email: "matheus.lima@torg.com.br", name: "Matheus Lima",  role: "COMERCIAL",    setor: "Comercial"  },
  { email: "compras@torg.com.br",      name: "Compras",       role: "COMPRAS",      setor: "Compras"    },
  { email: "engenharia@torg.com.br",   name: "Engenharia",    role: "ENGENHARIA",   setor: "Engenharia" },
  { email: "almoxarifado@torg.com.br", name: "Almoxarifado",  role: "ALMOXARIFADO", setor: "Almoxarifado" },
];

async function main() {
  console.log(`\nCriando ${usuarios.length} usuarios...\n`);
  const credenciais = [];

  for (const u of usuarios) {
    const local = u.email.split("@")[0];
    const senhaInicial = senhaPara(local);
    const hash = await bcrypt.hash(senhaInicial, 10);

    const existente = await prisma.user.findUnique({ where: { email: u.email } });

    if (existente) {
      // Atualiza senha + role caso ja exista (idempotente)
      await prisma.user.update({
        where: { email: u.email },
        data: { password: hash, role: u.role, name: u.name, setor: u.setor, ativo: true },
      });
      console.log(`  ↻ atualizado: ${u.email} (${u.role})`);
    } else {
      await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          password: hash,
          role: u.role,
          setor: u.setor,
          ativo: true,
        },
      });
      console.log(`  ✓ criado:    ${u.email} (${u.role})`);
    }

    credenciais.push({ email: u.email, senha: senhaInicial, role: u.role });
  }

  console.log("\n— Credenciais geradas —");
  for (const c of credenciais) {
    console.log(`  ${c.email.padEnd(32)} | ${c.senha.padEnd(20)} | ${c.role}`);
  }
  console.log("\n⚠  Compartilhe cada senha individualmente com o usuario. Adicione tela de troca de senha em breve.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
