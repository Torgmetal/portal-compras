/**
 * ska-explorar.js — Explora datasets/relatórios do SKA Syneco
 *
 * O endpoint /v1/dataset retorna TODOS os datasets com { sql, parameters, columns, data }.
 * Este script baixa essa lista e permite buscar/inspecionar localmente.
 *
 * USO (na pasta C:\MesSync, com o mesmo .env do agente):
 *
 *   node ska-explorar.js                      → lista todos (id + colunas de saída)
 *   node ska-explorar.js --find Pai           → só datasets cujas colunas/SQL contêm "Pai"
 *   node ska-explorar.js --find Peso          → procura "Peso"
 *   node ska-explorar.js --sql 123            → imprime SQL completo + colunas do dataset 123
 *   node ska-explorar.js --run 123 --obra T87 → roda o dataset 123 e mostra amostra real
 *
 * Para achar as ORDENS PLANEJADAS (conjunto→marca), procure por:
 *   --find Pai     (coluna "Item Pai")
 *   --find Parent
 *   --find Peso
 *   --find Estrutura
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
const FIND   = getArg("find");
const SQL_ID = getArg("sql");
const RUN_ID = getArg("run");
const OBRA   = getArg("obra");

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
  console.log(`✓ Login OK\n`);
  return token;
}

// Baixa a lista completa de datasets
async function baixarDatasets(token) {
  const resp = await fetch(`${SKA_API_URL}/v1/dataset`, {
    method: "GET", headers: { token }, timeout: 60000,
  });
  if (!resp.ok) throw new Error(`/v1/dataset → HTTP ${resp.status}`);
  const data = await resp.json();
  const lista = Array.isArray(data) ? data : (data.data || data.rows || data.result || []);
  return lista;
}

// Extrai id, nome, sql e colunas de um item (estrutura flexível)
function parseItem(item) {
  const sqlObj  = item.sql || {};
  const id      = sqlObj.dataSetId ?? item.dataSetId ?? item.id ?? "?";
  const nome    = sqlObj.name ?? item.name ?? "";
  const sqlText = (typeof sqlObj === "string" ? sqlObj : sqlObj.sql) || item.sqlText || "";
  // columns pode ser array de strings ou de objetos
  let cols = item.columns || sqlObj.columns || [];
  if (Array.isArray(cols)) {
    cols = cols.map(c => (typeof c === "string" ? c : (c.name || c.caption || c.title || c.field || JSON.stringify(c))));
  } else {
    cols = [];
  }
  return { id, nome, sqlText: String(sqlText), cols };
}

function listar(lista) {
  const termo = (FIND || "").toLowerCase();
  let mostrados = 0;
  for (const item of lista) {
    const { id, nome, sqlText, cols } = parseItem(item);
    const haystack = (cols.join(" ") + " " + sqlText + " " + nome).toLowerCase();
    if (termo && !haystack.includes(termo)) continue;
    mostrados++;
    console.log(`[${id}] ${nome || "(sem nome)"}`);
    if (cols.length > 0) console.log(`     colunas: ${cols.join(", ")}`);
  }
  console.log(`\n${mostrados} dataset(s)${termo ? ` contendo "${FIND}"` : ""}.`);
  if (termo && mostrados === 0) {
    console.log(`Nenhum com "${FIND}". Tente: --find Parent | --find Peso | --find Qtd | --find Estrutura`);
  }
}

function mostrarSql(lista, id) {
  const item = lista.find(it => String(parseItem(it).id) === String(id));
  if (!item) { console.log(`Dataset ${id} não encontrado.`); return; }
  const { nome, sqlText, cols } = parseItem(item);
  console.log(`=== Dataset ${id} — ${nome} ===\n`);
  console.log("COLUNAS DE SAÍDA:", cols.join(", ") || "(não informadas)", "\n");
  console.log("SQL COMPLETO:\n");
  console.log(sqlText);
}

async function rodar(token, id) {
  console.log(`── Rodando dataset ${id}${OBRA ? ` (obra=${OBRA})` : ""} ──\n`);
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
  if (!resp.ok) { console.log(`HTTP ${resp.status}: ${(await resp.text()).slice(0,300)}`); return; }
  const data = await resp.json();
  const rows = Array.isArray(data) ? data : (data.data || data.rows || data.result || []);
  if (!Array.isArray(rows) || rows.length === 0) { console.log("Sem linhas:", JSON.stringify(data).slice(0,300)); return; }
  console.log(`${rows.length} linhas.\nCOLUNAS:`, Object.keys(rows[0]).join(", "), "\n");
  rows.slice(0, 3).forEach((r, i) => console.log(`[${i}]`, JSON.stringify(r, null, 2)));
}

async function main() {
  if (!SKA_USER || !SKA_PASS) { console.error("SKA_USER/SKA_PASS não configurados no .env"); process.exit(1); }
  try {
    const token = await login();
    if (RUN_ID) { await rodar(token, RUN_ID); return; }
    const lista = await baixarDatasets(token);
    console.log(`Total: ${lista.length} datasets\n`);
    if (SQL_ID) mostrarSql(lista, SQL_ID);
    else        listar(lista);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exit(1);
  }
}

main();
