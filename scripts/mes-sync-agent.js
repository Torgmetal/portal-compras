/**
 * mes-sync-agent.js — Agente de sincronização MES SKA Syneco → Portal Torg
 *
 * Fonte: Dataset 150 — "TORG_Production_Traceability_Detalhado"
 *   É um SNAPSHOT: uma linha por peça/operação/obra com PLANEJADO vs PRODUZIDO
 *   (acumulado). Inclui peças NÃO INICIADAS (planejado>0, produzido=0).
 *
 *   Como é snapshot (e não eventos), NÃO precisa de blocos mensais: uma única
 *   busca com período amplo já traz o estado atual completo. O portal faz
 *   upsert em massa (1 SQL por lote), então é rápido.
 *
 * USO
 *   node mes-sync-agent.js                     → snapshot dos últimos 3 anos (padrão)
 *   node mes-sync-agent.js --start 2025-01-01  → snapshot desde 01/01/2025
 *   node mes-sync-agent.js --anos 2            → snapshot dos últimos 2 anos
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fetch = require("node-fetch");
const fs    = require("fs");

function getArg(name) {
  const argv = process.argv.slice(2);
  const idx  = argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return null;
  if (argv[idx].includes("=")) return argv[idx].split("=").slice(1).join("=");
  return argv[idx + 1] || null;
}
const ARG_START = getArg("start");
const ARG_ANOS  = getArg("anos");

const SKA_API_URL    = (process.env.SKA_API_URL    || "http://192.168.0.190:1000").replace(/\/$/, "");
const SKA_USER       = process.env.SKA_USER;
const SKA_PASS       = process.env.SKA_PASS;
const PORTAL_API_URL = (process.env.PORTAL_API_URL || "https://workspace.torg.com.br").replace(/\/$/, "");
const PORTAL_API_KEY = process.env.PORTAL_API_KEY;
const SKA_DATASET_ID = "150";
const LOG_FILE       = process.env.LOG_FILE || path.join(__dirname, "mes-sync.log");

function log(msg) {
  const linha = `[${new Date().toISOString()}] ${msg}`;
  console.log(linha);
  try { fs.appendFileSync(LOG_FILE, linha + "\n"); } catch (_) {}
}
function fmtISO(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtData(d) { return d.toISOString().split("T")[0]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function num(v) { return parseFloat(String(v ?? "0").replace(",", ".")) || 0; }

async function skaLogin() {
  if (!SKA_USER || !SKA_PASS) throw new Error("SKA_USER e SKA_PASS não configurados no .env");
  const resp = await fetch(`${SKA_API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: SKA_USER, password: SKA_PASS }),
    timeout: 15000,
  });
  if (!resp.ok) throw new Error(`Login SKA falhou (${resp.status}): ${(await resp.text().catch(()=>"")).slice(0,200)}`);
  const data  = await resp.json();
  const token = data.data?.[0]?.token || data.token || data.accessToken || data.jwt;
  if (!token) throw new Error("Token não encontrado: " + JSON.stringify(data).slice(0,200));
  log(`Login OK — token ${token.length} chars`);
  return token;
}

// Busca o snapshot completo do dataset 150 (uma chamada)
async function skaFetchSnapshot(token, startDate, endDate) {
  log(`SKA fetch: ${fmtISO(startDate)} → ${fmtISO(endDate)}`);
  const qs = [
    "interval=0",
    `%23StartDate=${encodeURIComponent(fmtISO(startDate))}`,
    `%23EndDate=${encodeURIComponent(fmtISO(endDate))}`,
    "%23OP=Todos", "%23Item=Todos", "%23Obra=Todos",
    "%23Setor=Todos", "%23Status=TODOS",
    "%23Resource=Todos", "%23Resource_concat=Todos",
    "page=1", "pageSize=999999",
  ].join("&");
  const resp = await fetch(`${SKA_API_URL}/v1/dataset/${SKA_DATASET_ID}/run?${qs}`, {
    method: "GET", headers: { token }, timeout: 300000, // 5 min — snapshot grande
  });
  if (!resp.ok) throw new Error(`Dataset ${SKA_DATASET_ID} erro (${resp.status}): ${(await resp.text().catch(()=>"")).slice(0,300)}`);
  const data = await resp.json();
  const rows = Array.isArray(data) ? data : (data.data || data.rows || data.result || []);
  if (!Array.isArray(rows)) throw new Error("Formato inesperado: " + JSON.stringify(data).slice(0,200));
  return rows;
}

function transformarLinha(row) {
  const obra = String(row["Obra"] || "").trim();
  const op   = String(row["OP"]   || "").trim();
  const item = String(row["Item"] || "").trim();
  const operacao = String(row["Operação"] || row["Operacao"] || "").trim();
  if (!obra || !op || !item || !operacao) return null;
  if (obra === "---" || obra.toLowerCase() === "todos") return null;
  if (obra.toUpperCase().includes("INTERNO") || obra.toUpperCase().includes("MANUT")) return null;

  const pid = row["ProductionID"] ?? row["ProductionId"];
  return {
    obra, op, item, operacao,
    setor:    String(row["Setor"]      || "").trim() || null,
    descItem: String(row["Desc. Item"] || row["DescItem"] || "").trim() || null,
    maquina:  String(row["Máquina"]    || row["Maquina"]  || "").trim() || null,
    operador: String(row["Operador"]   || "").trim() || null,
    planejadoUn:   num(row["Planejado"]),
    produzidoUn:   num(row["Produzido"]),
    rejeitadoUn:   num(row["Rejeitado"]),
    saldoUn:       num(row["Saldo"]),
    pesoPlanejado: num(row["PesoPlanejado"]),
    pesoProduzido: num(row["Peso"]),
    saldoRestante: num(row["SaldoRestante"]),
    status:        String(row["Status"] || "").trim() || null,
    productionId:  pid != null && Number(pid) > 0 ? Number(pid) : null,
    dataInicio:    row["Data de Início"] ? String(row["Data de Início"]).trim() : null,
    dataFim:       row["Data de Fim"]    ? String(row["Data de Fim"]).trim()    : null,
  };
}

// Envia em lotes PEQUENOS com pausa entre eles (a compute do Neon é pequena e
// precisa de tempo para liberar memória entre escritas, senão estoura OOM).
async function enviarPortal(ordens, dataInicio, dataFim) {
  if (!PORTAL_API_KEY) throw new Error("PORTAL_API_KEY não configurada no .env");
  const LOTE      = Number(process.env.LOTE      || 1000); // linhas por requisição
  const PAUSA_MS  = Number(process.env.PAUSA_MS  || 300);  // respiro entre lotes
  const MAX_TENT  = Number(process.env.MAX_TENT  || 6);
  let processados = 0;

  for (let i = 0; i < ordens.length; i += LOTE) {
    const lote = ordens.slice(i, i + LOTE);
    const nLote = Math.floor(i / LOTE) + 1, total = Math.ceil(ordens.length / LOTE);
    for (let t = 1; t <= MAX_TENT; t++) {
      try {
        const resp = await fetch(`${PORTAL_API_URL}/api/mes/sync-ordens`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${PORTAL_API_KEY}` },
          body: JSON.stringify({ ordens: lote, dataInicio: fmtData(dataInicio), dataFim: fmtData(dataFim) }),
          timeout: 120000,
        });
        if (!resp.ok) throw new Error(`Portal ${resp.status}: ${(await resp.text().catch(()=>"")).slice(0,200)}`);
        const r = await resp.json();
        processados += r.processados || r.atualizados || 0;
        log(`  Lote ${nLote}/${total} (${lote.length}): ✓ ${r.processados ?? "?"} processados`);
        break;
      } catch (e) {
        if (t < MAX_TENT) {
          // backoff crescente — dá tempo da compute recuperar memória
          const espera = 5000 * t;
          log(`  Lote ${nLote}/${total} tent.${t}/${MAX_TENT} falhou: ${e.message}. Aguardando ${espera/1000}s...`);
          await sleep(espera);
        } else throw new Error(`Lote ${nLote}/${total} falhou após ${MAX_TENT} tentativas: ${e.message}`);
      }
    }
    // pausa entre lotes bem-sucedidos: respiro para o Neon
    if (i + LOTE < ordens.length) await sleep(PAUSA_MS);
  }
  return { processados };
}

async function main() {
  log("=== Início sync MES (dataset 150 — snapshot) ===");
  const t0 = Date.now();
  try {
    const hoje = new Date(); hoje.setHours(23, 59, 59, 0);
    let inicio;
    if (ARG_START) {
      inicio = new Date(ARG_START + "T00:00:00");
      if (isNaN(inicio.getTime())) throw new Error(`--start inválido: "${ARG_START}". Use YYYY-MM-DD`);
    } else {
      const anos = ARG_ANOS ? parseInt(ARG_ANOS, 10) : 3;
      inicio = new Date(hoje); inicio.setFullYear(inicio.getFullYear() - anos); inicio.setHours(0,0,0,0);
    }
    log(`Período (snapshot): ${fmtData(inicio)} → ${fmtData(hoje)}`);

    const token = await skaLogin();

    const tFetch = Date.now();
    const linhas = await skaFetchSnapshot(token, inicio, hoje);
    log(`SKA retornou ${linhas.length} linhas em ${((Date.now()-tFetch)/1000).toFixed(1)}s`);
    if (linhas.length > 0) log(`Campos: ${Object.keys(linhas[0]).join(", ")}`);

    const ordens = linhas.map(transformarLinha).filter(Boolean);
    const ign = linhas.length - ordens.length;
    const naoIniciadas = ordens.filter(o => o.produzidoUn === 0 && o.planejadoUn > 0).length;
    log(`${ordens.length} válidas${ign>0?` (${ign} ignoradas)`:""} · ${naoIniciadas} não iniciadas`);
    if (ordens.length === 0) { log("Nada a enviar."); return; }

    const res = await enviarPortal(ordens, inicio, hoje);

    log(`\n${"─".repeat(60)}`);
    log(`Sync concluído em ${((Date.now()-t0)/1000).toFixed(1)}s`);
    log(`Linhas SKA  : ${linhas.length}`);
    log(`Processados : ${res.processados}`);
  } catch (err) {
    log(`\nERRO FATAL: ${err.message}`);
    process.exit(1);
  }
  log("=== Fim sync MES ===\n");
}

main();
