#!/usr/bin/env node
/**
 * Gera o número de build do portal (versao-build.json) a partir da contagem de commits.
 *
 * ⚠ Por que gravar em arquivo em vez de contar no build da Vercel: a Vercel faz clone RASO
 * do repositório (`--depth`), então `git rev-list --count HEAD` lá retorna ~10 em vez dos
 * milhares de commits reais. O número tem que viajar junto com o commit.
 *
 * Rodado automaticamente pelo hook .githooks/pre-commit (que também dá `git add` no arquivo),
 * ou na mão com `npm run versao`.
 *
 * O commit que está sendo criado ainda não existe no `rev-list`, por isso o +1: o número
 * gravado já é o do próprio commit.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ARQUIVO = path.join(__dirname, "..", "versao-build.json");

function contarCommits() {
  return Number(execSync("git rev-list --count HEAD").toString().trim());
}

/**
 * Últimos commits, para a tela /versao mostrar "o que mudou" sem depender de changelog na mão.
 * Gravados aqui (e não lidos no build) pelo mesmo motivo do número: o clone da Vercel é raso.
 */
const QTD_HISTORICO = 30;

function historico() {
  const bruto = execSync(
    `git log -${QTD_HISTORICO} --date=format:%d/%m/%Y --format=%h\u001f%cd\u001f%s`
  ).toString();
  return bruto
    .split("\n")
    .filter(Boolean)
    .map((linha) => {
      const [hash, data, titulo] = linha.split("\u001f");
      return { hash, data, titulo };
    });
}

try {
  const build = contarCommits() + 1;
  const atual = fs.existsSync(ARQUIVO)
    ? JSON.parse(fs.readFileSync(ARQUIVO, "utf8"))
    : {};

  // Nunca deixar o número andar pra trás (ex.: rebase que reescreve histórico). Sem `+1` aqui:
  // rodar o script duas vezes antes de commitar tem que dar o MESMO número, não inflar.
  const numero = Math.max(build, atual.build ?? 0);

  fs.writeFileSync(
    ARQUIVO,
    JSON.stringify(
      { build: numero, gerado: new Date().toISOString(), commits: historico() },
      null,
      2
    ) + "\n"
  );
  console.log(`versao-build.json → build ${numero}`);
} catch (e) {
  console.error("Não foi possível gerar o número de build:", e.message);
  process.exit(1);
}
