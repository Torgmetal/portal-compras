// O FLUXO DO CRACHÁ NO NAVEGADOR — bipar num posto, ser recusado no outro.
//
//   node scripts/mes-lab/fluxo-cracha.mjs <credenciais> <cracha> <POSTO_1> <POSTO_2> saida.png
//
// ⚠ A prova contra o banco (provar-cracha.mjs) exercita as LIBS. Esta exercita a ROTA e a TELA —
// é onde apareceria, por exemplo, o `presencaId` não voltando do `entrar` e derrubando todo
// comando seguinte com "Bipe o crachá".
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const LIBS = path.join(os.homedir(), ".local/share/torg-playwright/lib");
if (fs.existsSync(LIBS)) process.env.LD_LIBRARY_PATH = [LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

const BASE = "http://localhost:3000";
const [email, senha] = fs.readFileSync(process.argv[2], "utf8").trim().split("\n").map((s) => s.trim());
const CRACHA = process.argv[3];
const [P1, P2] = [process.argv[4], process.argv[5]];
const SAIDA = process.argv[6];

const { chromium } = await import("playwright");
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
const problemas = [];
// ⚠ O 409 É A RECUSA FUNCIONANDO, não um defeito: é assim que a rota do totem devolve regra de
// negócio (crachá aberto em outro posto, saldo estourado). O navegador registra qualquer 4xx como
// erro de console, então ele é filtrado aqui — senão a prova acusaria justamente o que ela testa.
pg.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" && !/status of 409/.test(t)) problemas.push(`console: ${t.slice(0, 160)}`);
});
pg.on("pageerror", (e) => problemas.push(`pageerror: ${e.message.slice(0, 160)}`));
pg.on("response", (r) => {
  const p = new URL(r.url()).pathname;
  if (r.status() >= 500 && p.startsWith("/api/")) problemas.push(`HTTP ${r.status()} em ${p}`);
});

await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle", timeout: 120000 });
await pg.fill('input[type="email"]', email);
await pg.fill('input[type="password"]', senha);
await pg.press('input[type="password"]', "Enter");
await pg.waitForURL((u) => !u.pathname.includes("/entrar"), { timeout: 60000 });

const bipar = async (posto) => {
  await pg.goto(`${BASE}/mes-lab/totem/${posto}`, { waitUntil: "networkidle", timeout: 120000 });
  await pg.fill('input[placeholder="• • • •"]', CRACHA);
  await pg.press('input[placeholder="• • • •"]', "Enter");
  await pg.waitForTimeout(2500);
};

await bipar(P1);
const entrou = await pg.locator("text=Bipe o seu crachá").count();
console.log(entrou === 0 ? `✓ bipou e entrou em ${P1}` : `✗ continuou na tela do crachá em ${P1}`);

await bipar(P2);
const aviso = await pg.locator("body").innerText();
const recusou = /crachá está aberto em/i.test(aviso);
console.log(recusou ? `✓ ${P2} recusou e explicou` : `✗ ${P2} NÃO recusou`);
const linha = aviso.split("\n").find((l) => /crachá está aberto em/i.test(l));
if (linha) console.log(`     ↳ "${linha.trim()}"`);
await pg.screenshot({ path: SAIDA, fullPage: true });

console.log(problemas.length ? `✗ ${problemas.length} problema(s): ${problemas.join(" | ")}` : "✓ sem erro de console nem 5xx");
await nav.close();
