#!/usr/bin/env node
/**
 * VALIDAR UMA TELA DE VERDADE, LOGADO, ANTES DE SUBIR.
 *
 * O CLAUDE.md manda validar no `npm run dev` antes do push. Para tela atrás de login isso não é
 * uma olhada rápida: o `middleware.js` devolve 307 para /entrar antes mesmo de a página compilar,
 * então `curl` não prova nada além de que o middleware funciona.
 *
 * Uso:
 *   node scripts/validar-tela.mjs <arquivo-de-credenciais> <caminho> [saida.png] [--mobile] [--esperar=seletor]
 *
 * Exemplos:
 *   node scripts/validar-tela.mjs ~/cred.txt /expedicao/conferencia conf.png --mobile
 *   node scripts/validar-tela.mjs ~/cred.txt /expedicao/etiquetas etq.png --esperar=table
 *
 * ⚠⚠ AS CREDENCIAIS FICAM FORA DO REPOSITÓRIO. O arquivo é um caminho passado por argumento, com
 * e-mail na primeira linha e senha na segunda. Nada de credencial neste arquivo, nem no histórico
 * do git — este script só sabe LER o que você apontar.
 *
 * ⚠ Ele aponta para o `localhost:3000`, nunca para produção: é ferramenta de validação local, e
 * apontar para o portal no ar transformaria um teste de tela numa ação em dado real.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ⚠ CHROMIUM SEM ROOT NO WSL. O `playwright install-deps` quer apt e senha; aqui as bibliotecas
// (libnspr4, libnss3, libasound) foram extraídas dos .deb e vivem no diretório do usuário. Sem
// isto o navegador morre com "error while loading shared libraries" e a mensagem não diz qual tela.
const LIBS = path.join(os.homedir(), ".local/share/torg-playwright/lib");
if (fs.existsSync(LIBS)) {
  process.env.LD_LIBRARY_PATH = [LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
}

const [, , credenciais, caminho, saida = "tela.png", ...resto] = process.argv;
if (!credenciais || !caminho) {
  console.error("uso: node scripts/validar-tela.mjs <credenciais> <caminho> [saida.png] [--mobile] [--esperar=sel]");
  process.exit(2);
}
const mobile = resto.includes("--mobile");
const esperar = resto.find((a) => a.startsWith("--esperar="))?.slice(10);
const BASE = process.env.PORTAL_BASE || "http://localhost:3000";

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) {
  console.error(`recusado: ${BASE} não é local. Esta ferramenta só valida o servidor de dev.`);
  process.exit(2);
}

const [email, senha] = fs.readFileSync(credenciais, "utf8").trim().split("\n").map((s) => s.trim());
const { chromium } = await import("playwright");

const nav = await chromium.launch();
const ctx = await nav.newContext(
  // iPhone 12-ish: é o tamanho em que a Conferência de Peça vai ser usada de verdade.
  mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
         : { viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();

const problemas = [];
pg.on("console", (m) => { if (m.type() === "error") problemas.push(`console: ${m.text().slice(0, 200)}`); });
pg.on("pageerror", (e) => problemas.push(`pageerror: ${e.message.slice(0, 200)}`));
pg.on("response", (r) => {
  if (r.status() >= 400 && new URL(r.url()).pathname.startsWith("/api/")) {
    problemas.push(`HTTP ${r.status()} em ${new URL(r.url()).pathname}`);
  }
});

await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle", timeout: 120000 });
await pg.fill('input[type="email"]', email);
await pg.fill('input[type="password"]', senha);
await pg.press('input[type="password"]', "Enter");
await pg.waitForURL((u) => !u.pathname.includes("/entrar"), { timeout: 60000 });

await pg.goto(`${BASE}${caminho}`, { waitUntil: "networkidle", timeout: 120000 });
if (esperar) await pg.waitForSelector(esperar, { timeout: 60000 }).catch(() => problemas.push(`não apareceu: ${esperar}`));
await pg.waitForTimeout(1200);
await pg.screenshot({ path: saida, fullPage: true });

console.log(`✓ ${caminho} — ${mobile ? "390×844 (celular)" : "1440×900"} → ${saida}`);
if (problemas.length) {
  console.log(`\n⚠ ${problemas.length} problema(s) na tela:`);
  for (const p of [...new Set(problemas)]) console.log("   " + p);
} else {
  console.log("  sem erro de console nem resposta 4xx/5xx de API.");
}
await nav.close();
process.exit(problemas.length ? 1 : 0);
