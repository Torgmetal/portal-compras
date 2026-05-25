#!/usr/bin/env node
/**
 * npm run atualizar
 *
 * Puxa as alterações do outro desenvolvedor e exibe um resumo formatado
 * do que mudou desde o último pull.
 *
 * Uso:
 *   npm run atualizar
 */

import { execSync } from "child_process";

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";
const BLUE   = "\x1b[34m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const RED    = "\x1b[31m";

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", ...opts }).trim();
}

function titulo(txt) {
  console.log(`\n${BOLD}${BLUE}${txt}${RESET}`);
  console.log(`${DIM}${"─".repeat(50)}${RESET}`);
}

// ── 1. Salva HEAD atual antes do pull ─────────────────────────────
const headAntes = run("git rev-parse HEAD");

// ── 2. Faz o pull ─────────────────────────────────────────────────
titulo("⬇  Buscando alterações do servidor...");
try {
  const pullOutput = run("git pull origin main");
  console.log(pullOutput);
} catch (e) {
  console.error(`${RED}Erro ao fazer pull:${RESET}`, e.message);
  process.exit(1);
}

// ── 3. Verifica se havia algo novo ────────────────────────────────
const headDepois = run("git rev-parse HEAD");

if (headAntes === headDepois) {
  console.log(`\n${GREEN}✔  Já estava atualizado — nenhuma alteração nova.${RESET}\n`);
  process.exit(0);
}

// ── 4. Lista os commits novos ──────────────────────────────────────
titulo("📋  Commits recebidos");

const logRaw = run(
  `git log ${headAntes}..${headDepois} --format="%H|%an|%ad|%s" --date=format:"%d/%m/%Y %H:%M"`
);

const commits = logRaw.split("\n").filter(Boolean).map((linha) => {
  const [hash, autor, data, ...msgParts] = linha.split("|");
  return { hash: hash.slice(0, 7), autor, data, msg: msgParts.join("|") };
});

for (const c of commits) {
  const quem   = c.autor.includes("Vitor") ? `${YELLOW}Vitor${RESET}` : `${CYAN}Matheus${RESET}`;
  console.log(`  ${GREEN}${c.hash}${RESET}  ${DIM}${c.data}${RESET}  ${quem}  ${c.msg}`);
}

// ── 5. Arquivos alterados por commit ───────────────────────────────
titulo("📁  Arquivos modificados");

for (const c of commits) {
  const arquivos = run(`git diff-tree --no-commit-id -r --name-status ${c.hash}`);
  if (!arquivos) continue;

  console.log(`\n  ${GREEN}${c.hash}${RESET}  ${DIM}${c.msg}${RESET}`);
  for (const linha of arquivos.split("\n").filter(Boolean)) {
    const [status, ...pathParts] = linha.split(/\s+/);
    const arquivo = pathParts.join(" ");
    const icone = status === "A" ? `${GREEN}+${RESET}` :
                  status === "D" ? `${RED}-${RESET}` :
                  `${YELLOW}~${RESET}`;
    console.log(`    ${icone}  ${arquivo}`);
  }
}

// ── 6. Resumo final ────────────────────────────────────────────────
titulo("✅  Atualização concluída");

const autores = [...new Set(commits.map(c => c.autor))].join(", ");
console.log(`  ${commits.length} commit(s) de ${BOLD}${autores}${RESET} aplicados.`);
console.log(`  Build local desatualizado — rode ${BOLD}npm run dev${RESET} para ver as mudanças.\n`);
