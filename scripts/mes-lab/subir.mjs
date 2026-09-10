// SOBE O POSTGRES DO LABORATÓRIO — sem sudo, sem Docker, fora do repositório.
//
//   node scripts/mes-lab/subir.mjs        # instala na primeira vez, depois só sobe
//
// ⚠⚠ POR QUE NÃO `sudo apt install postgresql`. Não é para evitar a senha — é para o laboratório
// ser DESCARTÁVEL. `embedded-postgres` baixa o binário OFICIAL do PostgreSQL (18.x de verdade, não
// emulação) para o diretório do usuário e o roda como processo comum, na porta 55432. Errar aqui
// não suja a máquina: recomeçar do zero é apagar uma pasta. Um serviço do sistema na 5432, com o
// usuário `postgres` global, seria o contrário disso.
//
// ⚠ Mora em `~/.local/share`, FORA do repositório — mesmo padrão do graphify e do Playwright neste
// projeto. São ~200 MB de binário: dentro do projeto seriam um acidente esperando o `git add -A`.

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

const BASE = path.join(os.homedir(), ".local/share/torg-mes-lab");
const DADOS = path.join(BASE, "dados");
const PORTA = 55432;
const BANCO = "torg_mes_lab";

if (!fs.existsSync(path.join(BASE, "node_modules/embedded-postgres"))) {
  console.log(`Instalando o Postgres embarcado em ${BASE} (uma vez só)…`);
  fs.mkdirSync(BASE, { recursive: true });
  const npm = (...args) => execFileSync("npm", args, { cwd: BASE, stdio: "inherit" });
  if (!fs.existsSync(path.join(BASE, "package.json"))) npm("init", "-y");
  npm("install", "embedded-postgres");
}

const { default: EmbeddedPostgres } = await import(
  path.join(BASE, "node_modules/embedded-postgres/dist/index.js")
);

const pg = new EmbeddedPostgres({
  databaseDir: DADOS,
  user: "torg",
  password: "torg",
  port: PORTA,
  persistent: true,
});

// `PG_VERSION` é o carimbo do `initdb`: sem ele o diretório é uma pasta vazia, não um cluster.
if (!fs.existsSync(path.join(DADOS, "PG_VERSION"))) {
  console.log("initdb…");
  await pg.initialise();
}

await pg.start();
await pg.createDatabase(BANCO).catch(() => { /* já existe — o script é repetível */ });

console.log(`
Laboratório no ar.

  MES_LAB_URL=postgresql://torg:torg@localhost:${PORTA}/${BANCO}

Aplicar o schema (⚠ a variável vence o .env — conferido; ver docs/mes-proprio.md §10.2):
  DATABASE_URL=$MES_LAB_URL DIRECT_URL=$MES_LAB_URL npx prisma db push

Encher com dado real de produção:
  MES_LAB_URL=... node --env-file=.env.local scripts/mes-lab/importar.mjs --meses=6

Ctrl-C encerra o Postgres.`);

// `persistent: true` guarda os dados entre execuções; este processo fica de pé só para segurar o
// servidor. Encerrar limpo evita deixar o cluster precisando de recuperação no próximo boot.
for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, async () => {
    console.log("\nEncerrando o Postgres do laboratório…");
    await pg.stop().catch(() => {});
    process.exit(0);
  });
}
