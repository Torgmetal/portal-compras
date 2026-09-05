/**
 * ska-probe.js — Descobre a API de ESCRITA do SKA Syneco (correção/lançamento de apontamento)
 *
 * ⚠️ SEGURO: este script NÃO grava nada no Syneco. Ele só:
 *   - faz login (POST /v1/auth/login)
 *   - procura documentação viva (Swagger / OpenAPI)
 *   - pergunta a cada rota candidata quais MÉTODOS ela aceita (HTTP OPTIONS) e
 *     se ela existe (GET → 200/401/403/405 = existe; 404 = não existe)
 *   Nenhum POST/PUT/DELETE de dados é enviado.
 *
 * Objetivo: achar o endpoint que o Syneco usa para LANÇAR/CORRIGIR a quantidade
 * produzida de uma marca num setor (o que o operador esqueceu de apontar).
 *
 * USO (na pasta C:\MesSync, com o mesmo .env do agente):
 *   node ska-probe.js                 → roda toda a varredura e imprime um relatório
 *   node ska-probe.js --salvar        → também grava o relatório em ska-probe-resultado.json
 *   node ska-probe.js --base http://192.168.0.190:1000   → sobrescreve a URL base
 *
 * Depois, mande o arquivo ska-probe-resultado.json (ou a saída do terminal) pro Claude.
 *
 * IMPORTANTE: o jeito MAIS confiável de achar o endpoint é capturar pelo DevTools
 * o que o próprio Syneco envia ao corrigir um apontamento. Veja SKA-WRITEBACK.md.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fetch = require("node-fetch");
const fs = require("fs");

function getArg(name) {
  const argv = process.argv.slice(2);
  const idx = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return null;
  if (argv[idx].includes("=")) return argv[idx].split("=").slice(1).join("=");
  return argv[idx + 1] || null;
}
const temFlag = (name) => process.argv.slice(2).includes(`--${name}`);

const SKA_API_URL = (getArg("base") || process.env.SKA_API_URL || "http://192.168.0.190:1000").replace(/\/$/, "");
const SKA_USER = process.env.SKA_USER;
const SKA_PASS = process.env.SKA_PASS;
const SALVAR = temFlag("salvar");

// Caminhos onde uma documentação viva de API costuma morar
const CAMINHOS_DOC = [
  "/swagger", "/swagger/index.html", "/swagger/v1/swagger.json", "/swagger.json",
  "/openapi.json", "/openapi", "/v1/openapi.json", "/v1/swagger.json",
  "/api-docs", "/api/docs", "/docs", "/v1/docs", "/redoc",
  "/v1", "/v1/", "/", "/health", "/v1/health",
];

// Rotas candidatas para LANÇAR/CORRIGIR produção. O padrão conhecido é /v1/<recurso>.
// Testamos só com OPTIONS (descobre métodos) e GET (descobre existência) — nunca POST.
const ROTAS_CANDIDATAS = [
  // produção / apontamento
  "/v1/production", "/v1/productions", "/v1/producao", "/v1/producoes",
  "/v1/apontamento", "/v1/apontamentos", "/v1/appointment", "/v1/appointments",
  "/v1/report", "/v1/reports", "/v1/reporting", "/v1/productionreport",
  "/v1/production/report", "/v1/production/append", "/v1/production/manual",
  // ordens / operações / itens
  "/v1/order", "/v1/orders", "/v1/op", "/v1/ops",
  "/v1/operation", "/v1/operations", "/v1/operacao", "/v1/operacoes",
  "/v1/item", "/v1/items", "/v1/itens",
  // recursos / máquinas / setores
  "/v1/resource", "/v1/resources", "/v1/machine", "/v1/machines",
  "/v1/setor", "/v1/setores", "/v1/sector", "/v1/sectors",
  // outros que aparecem em MES
  "/v1/event", "/v1/events", "/v1/stop", "/v1/stops", "/v1/parada", "/v1/paradas",
  "/v1/quantity", "/v1/quantities", "/v1/quantidade",
  // já conhecidos (controle/sanidade)
  "/v1/dataset", "/v1/auth/login",
];

async function login() {
  if (!SKA_USER || !SKA_PASS) throw new Error("SKA_USER/SKA_PASS não configurados no .env");
  const resp = await fetch(`${SKA_API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: SKA_USER, password: SKA_PASS }),
    timeout: 15000,
  });
  if (!resp.ok) throw new Error(`Login falhou (${resp.status}): ${(await resp.text().catch(() => "")).slice(0, 200)}`);
  const data = await resp.json();
  const token = data.data?.[0]?.token || data.token || data.accessToken || data.jwt || (typeof data === "string" ? data : null);
  if (!token) throw new Error("Token não encontrado: " + JSON.stringify(data).slice(0, 200));
  console.log(`✓ Login OK — token ${token.length} chars\n`);
  return token;
}

// Faz uma requisição tolerante a erro e devolve { status, allow, contentType, amostra }
async function sondar(metodo, caminho, token) {
  try {
    const resp = await fetch(`${SKA_API_URL}${caminho}`, {
      method: metodo,
      headers: token ? { token } : {},
      timeout: 12000,
    });
    const allow = resp.headers.get("allow") || resp.headers.get("access-control-allow-methods") || "";
    const contentType = resp.headers.get("content-type") || "";
    let amostra = "";
    if (metodo === "GET" && resp.status < 500) {
      amostra = (await resp.text().catch(() => "")).slice(0, 160).replace(/\s+/g, " ");
    }
    return { status: resp.status, allow, contentType, amostra };
  } catch (e) {
    return { status: 0, erro: e.message };
  }
}

// Interpreta o status num veredito legível
function veredito(status) {
  if (status === 0) return "sem resposta";
  if (status === 404) return "não existe";
  if (status === 401 || status === 403) return "EXISTE (auth)";
  if (status === 405) return "EXISTE (método errado)";
  if (status >= 200 && status < 300) return "EXISTE (ok)";
  if (status >= 500) return "erro servidor";
  return `status ${status}`;
}

async function main() {
  console.log(`── ska-probe — base ${SKA_API_URL} ──\n`);
  const resultado = { base: SKA_API_URL, quando: new Date().toISOString(), docs: [], rotas: [] };

  let token = null;
  try {
    token = await login();
    resultado.loginOk = true;
  } catch (e) {
    console.log(`✗ Login falhou: ${e.message}\n  (sigo sem token — algumas rotas ainda respondem)\n`);
    resultado.loginOk = false;
    resultado.loginErro = e.message;
  }

  // 1) Procura documentação viva (Swagger/OpenAPI) — o achado de ouro
  console.log("═══ 1) Documentação viva (Swagger / OpenAPI) ═══");
  for (const c of CAMINHOS_DOC) {
    const r = await sondar("GET", c, token);
    const v = veredito(r.status);
    const ehDoc = /swagger|openapi|redoc|html|json/i.test(r.contentType) && r.status >= 200 && r.status < 300;
    if (r.status && r.status !== 404) {
      console.log(`  ${ehDoc ? "★" : " "} ${c.padEnd(28)} ${v}  ${r.contentType}  ${r.amostra ? "→ " + r.amostra : ""}`);
    }
    resultado.docs.push({ caminho: c, ...r, ehDoc });
  }

  // 2) Sonda rotas candidatas de escrita (OPTIONS + GET — nunca POST)
  console.log("\n═══ 2) Rotas candidatas (OPTIONS = métodos aceitos, GET = existe?) ═══");
  console.log("    (procuramos linhas com 'EXISTE' e um Allow que liste POST/PUT)\n");
  for (const c of ROTAS_CANDIDATAS) {
    const opt = await sondar("OPTIONS", c, token);
    const get = await sondar("GET", c, token);
    const existe = [opt.status, get.status].some((s) => s && s !== 404 && s < 500);
    const allow = opt.allow || get.allow || "";
    if (existe) {
      const escrita = /POST|PUT|PATCH/i.test(allow) ? "  ⟵ ACEITA ESCRITA" : "";
      console.log(`  ✔ ${c.padEnd(26)} GET:${get.status} OPT:${opt.status}  Allow: ${allow || "(não informado)"}${escrita}`);
    }
    resultado.rotas.push({ caminho: c, options: opt, get, allow, existe });
  }

  const achadosDoc = resultado.docs.filter((d) => d.ehDoc).map((d) => d.caminho);
  const achadosEscrita = resultado.rotas.filter((r) => /POST|PUT|PATCH/i.test(r.allow)).map((r) => r.caminho);
  console.log("\n═══ Resumo ═══");
  console.log(`  Documentação encontrada: ${achadosDoc.length ? achadosDoc.join(", ") : "nenhuma"}`);
  console.log(`  Rotas que aceitam escrita: ${achadosEscrita.length ? achadosEscrita.join(", ") : "nenhuma detectada"}`);
  console.log(`\n  → Se nada apareceu aqui, use o método do DevTools (ver SKA-WRITEBACK.md): é o caminho mais certeiro.`);

  if (SALVAR) {
    const out = path.join(__dirname, "ska-probe-resultado.json");
    fs.writeFileSync(out, JSON.stringify(resultado, null, 2));
    console.log(`\n✓ Relatório salvo em ${out} — mande este arquivo pro Claude.`);
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
