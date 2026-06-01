/**
 * ska-explorar.js — Descobre datasets/relatórios disponíveis no SKA Syneco
 *
 * Objetivo: achar o dataset que contém as ORDENS PLANEJADAS (com ITEM PAI =
 * relação conjunto→marca), que é diferente do 242 (apontamentos de produção).
 *
 * USO (na pasta C:\MesSync, com o mesmo .env do agente):
 *
 *   node ska-explorar.js                    → lista todos os datasets/relatórios
 *   node ska-explorar.js --run 242          → roda o dataset 242 e mostra colunas + 3 linhas
 *   node ska-explorar.js --run 263 --obra T87  → roda filtrando uma obra
 *
 * Depois que achar o dataset das ordens planejadas, me passe:
 *   - o número do dataset
 *   - as colunas que ele retorna (o script imprime)
 *   - 2-3 linhas de exemplo
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fetch = require("node-fetch");

const SKA_API_URL = (process.env.SKA_API_URL || "http://192.168.0.190:1000").replace(/\/$/, "");
const SKA_USER    = process.env.SKA_USER;
const SKA_PASS    = process.env.SKA_PASS;

function getArg(name) {
  const argv = process.argv.slice(2);
  const idx  = argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return null;
  if (argv[idx].includes("=")) return argv[idx].split("=").slice(1).join("=");
  return argv[idx + 1] || null;
}
const RUN_ID  = getArg("run");
const OBRA    = getArg("obra");

async function login() {
  const resp = await fetch(`${SKA_API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: SKA_USER, password: SKA_PASS }),
    timeout: 15000,
  });
  if (!resp.ok) throw new Error(`Login falhou (${resp.status}): ${(await resp.text()).slice(0,200)}`);
  const data = await resp.json();
  const token = data.data?.[0]?.token || data.token || data.accessToken || data.jwt;
  if (!token) throw new Error("Token não encontrado: " + JSON.stringify(data).slice(0,200));
  console.log(`✓ Login OK — token ${token.length} chars\n`);
  return token;
}

// Tenta vários endpoints possíveis para listar datasets/relatórios
async function listarDatasets(token) {
  const endpoints = [
    "/v1/dataset",
    "/v1/datasets",
    "/v1/dataset/list",
    "/v1/report",
    "/v1/reports",
    "/v1/report/list",
    "/v1/datasource",
    "/v1/datasources",
  ];

  for (const ep of endpoints) {
    try {
      const resp = await fetch(`${SKA_API_URL}${ep}`, {
        method: "GET",
        headers: { token },
        timeout: 30000,
      });
      if (!resp.ok) {
        console.log(`  ${ep} → HTTP ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      const lista = Array.isArray(data) ? data : (data.data || data.rows || data.result || data.datasets || data.reports || []);
      if (Array.isArray(lista) && lista.length > 0) {
        console.log(`\n✓✓ ENCONTRADO em ${ep} — ${lista.length} itens:\n`);
        console.log("Campos de cada item:", Object.keys(lista[0]).join(", "), "\n");
        lista.forEach(item => {
          // Tenta extrair id + nome de forma flexível
          const id   = item.id ?? item.datasetId ?? item.reportId ?? item.code ?? item.codigo ?? "?";
          const nome = item.name ?? item.nome ?? item.description ?? item.descricao ?? item.title ?? JSON.stringify(item).slice(0,80);
          console.log(`  [${id}] ${nome}`);
        });
        return true;
      } else {
        console.log(`  ${ep} → OK mas vazio/formato inesperado: ${JSON.stringify(data).slice(0,150)}`);
      }
    } catch (e) {
      console.log(`  ${ep} → erro: ${e.message}`);
    }
  }
  console.log("\n⚠ Nenhum endpoint de listagem respondeu com dados.");
  console.log("Abra o SKA Reports manualmente e veja o número do relatório das ordens planejadas.");
  return false;
}

// Roda um dataset e mostra colunas + amostra
async function rodarDataset(token, id) {
  console.log(`\n── Rodando dataset ${id}${OBRA ? ` (obra=${OBRA})` : ""} ──\n`);
  const hoje = new Date();
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T00:00:00`;
  const ini = new Date(hoje); ini.setFullYear(ini.getFullYear() - 2);

  const qs = [
    "interval=0",
    `%23StartDate=${encodeURIComponent(fmt(ini))}`,
    `%23EndDate=${encodeURIComponent(fmt(hoje))}`,
    "%23OP=Todos", "%23Item=Todos",
    `%23Obra=${OBRA ? encodeURIComponent(OBRA) : "Todos"}`,
    "%23Setor=Todos", "%23Status=TODOS",
    "%23Resource=Todos", "%23Resource_concat=Todos",
    "page=1", "pageSize=10",
  ].join("&");

  const resp = await fetch(`${SKA_API_URL}/v1/dataset/${id}/run?${qs}`, {
    method: "GET", headers: { token }, timeout: 120000,
  });
  if (!resp.ok) {
    console.log(`Dataset ${id} → HTTP ${resp.status}: ${(await resp.text()).slice(0,300)}`);
    return;
  }
  const data = await resp.json();
  const rows = Array.isArray(data) ? data : (data.data || data.rows || data.result || []);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("Sem linhas. Resposta:", JSON.stringify(data).slice(0,300));
    return;
  }
  console.log(`Total de linhas: ${rows.length}\n`);
  console.log("COLUNAS:", Object.keys(rows[0]).join(", "), "\n");
  console.log("AMOSTRA (3 primeiras linhas):");
  rows.slice(0, 3).forEach((r, i) => console.log(`\n[${i}]`, JSON.stringify(r, null, 2)));
}

async function main() {
  if (!SKA_USER || !SKA_PASS) { console.error("SKA_USER/SKA_PASS não configurados no .env"); process.exit(1); }
  try {
    const token = await login();
    if (RUN_ID) {
      await rodarDataset(token, RUN_ID);
    } else {
      console.log("Procurando datasets/relatórios disponíveis...\n");
      await listarDatasets(token);
    }
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exit(1);
  }
}

main();
