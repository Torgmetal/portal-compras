/**
 * mes-sync-agent.js — Agente de sincronização MES SKA Syneco → Portal Torg
 *
 * Fonte: Dataset 150 — "TORG_Production_Traceability_Detalhado"
 *   Uma linha por peça/operação/obra com PLANEJADO vs PRODUZIDO.
 *   Inclui peças NÃO INICIADAS (planejado>0, produzido=0).
 *   (Substitui o antigo dataset 242, que só tinha apontamentos produzidos.)
 *
 * INSTALAÇÃO em C:\MesSync\
 *   1. Copiar este arquivo para C:\MesSync\mes-sync-agent.js
 *   2. .env com SKA_API_URL, SKA_USER, SKA_PASS, PORTAL_API_URL, PORTAL_API_KEY
 *   3. node mes-sync-agent.js
 *   4. Agendar via Task Scheduler a cada 1 hora
 *
 * USO
 *   node mes-sync-agent.js                     → sync padrão (SYNC_DIAS_ATRAS dias)
 *   node mes-sync-agent.js --dias 30           → últimos 30 dias
 *   node mes-sync-agent.js --start 2025-09-01  → backfill desde 01/09/2025 (blocos de 30d)
 *   node mes-sync-agent.js --start 2025-09-01 --end 2026-05-01
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fetch = require("node-fetch");
const fs    = require("fs");

// ─── Argumentos ─────────────────────────────────────────────────────────────────
function getArg(name) {
  const argv = process.argv.slice(2);
  const idx  = argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return null;
  if (argv[idx].includes("=")) return argv[idx].split("=").slice(1).join("=");
  return argv[idx + 1] || null;
}
const ARG_DIAS  = getArg("dias");
const ARG_START = getArg("start");
const ARG_END   = getArg("end");
const ARG_CHUNK = getArg("chunk");

// ─── Configuração ──────────────────────────────────────────────────────────────
const SKA_API_URL    = (process.env.SKA_API_URL    || "http://192.168.0.190:1000").replace(/\/$/, "");
const SKA_USER       = process.env.SKA_USER;
const SKA_PASS       = process.env.SKA_PASS;
const PORTAL_API_URL = (process.env.PORTAL_API_URL || "https://workspace.torg.com.br").replace(/\/$/, "");
const PORTAL_API_KEY = process.env.PORTAL_API_KEY;
const SYNC_DIAS_ATRAS = ARG_DIAS  ? parseInt(ARG_DIAS,  10) : parseInt(process.env.SYNC_DIAS_ATRAS || "1", 10);
const CHUNK_DIAS      = ARG_CHUNK ? parseInt(ARG_CHUNK, 10) : 30;
const SKA_DATASET_ID  = "150"; // TORG_Production_Traceability_Detalhado
const LOG_FILE        = process.env.LOG_FILE || path.join(__dirname, "mes-sync.log");

// ─── Utilitários ───────────────────────────────────────────────────────────────
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

function dividirEmBlocos(start, end, chunkDias) {
  const blocos = [];
  let cur = new Date(start);
  while (cur <= end) {
    const fim = new Date(cur);
    fim.setDate(fim.getDate() + chunkDias - 1);
    fim.setHours(23, 59, 59, 0);
    if (fim > end) fim.setTime(end.getTime());
    blocos.push({ inicio: new Date(cur), fim: new Date(fim) });
    cur.setDate(cur.getDate() + chunkDias);
    cur.setHours(0, 0, 0, 0);
  }
  return blocos;
}

// ─── Login SKA ─────────────────────────────────────────────────────────────────
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

// ─── Busca dataset 150 para um bloco ─────────────────────────────────────────────
async function skaFetchBloco(token, startDate, endDate) {
  log(`  SKA fetch: ${fmtISO(startDate)} → ${fmtISO(endDate)}`);
  const qs = [
    "interval=0",
    `%23StartDate=${encodeURIComponent(fmtISO(startDate))}`,
    `%23EndDate=${encodeURIComponent(fmtISO(endDate))}`,
    "%23OP=Todos", "%23Item=Todos", "%23Obra=Todos",
    "%23Setor=Todos", "%23Status=TODOS",
    "%23Resource=Todos", "%23Resource_concat=Todos",
    "page=1", "pageSize=99999",
  ].join("&");
  const resp = await fetch(`${SKA_API_URL}/v1/dataset/${SKA_DATASET_ID}/run?${qs}`, {
    method: "GET", headers: { token }, timeout: 180000,
  });
  if (!resp.ok) throw new Error(`Dataset ${SKA_DATASET_ID} erro (${resp.status}): ${(await resp.text().catch(()=>"")).slice(0,300)}`);
  const data = await resp.json();
  const rows = Array.isArray(data) ? data : (data.data || data.rows || data.result || []);
  if (!Array.isArray(rows)) throw new Error("Formato inesperado: " + JSON.stringify(data).slice(0,200));
  return rows;
}

// ─── Transforma linha SKA (dataset 150) → ordem do portal ───────────────────────
function transformarLinha(row) {
  const obra = String(row["Obra"] || "").trim();
  const op   = String(row["OP"]   || "").trim();
  const item = String(row["Item"] || "").trim();
  const operacao = String(row["Operação"] || row["Operacao"] || "").trim();

  // Obrigatórios para a chave de upsert
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

// ─── Envia ao portal em lotes de 500 com retry ───────────────────────────────────
async function enviarPortal(ordens, dataInicio, dataFim, duracaoSka) {
  if (!PORTAL_API_KEY) throw new Error("PORTAL_API_KEY não configurada no .env");
  const LOTE = 500, MAX_TENT = 3;
  let criados = 0, atualizados = 0;

  for (let i = 0; i < ordens.length; i += LOTE) {
    const lote = ordens.slice(i, i + LOTE);
    const n = Math.floor(i / LOTE) + 1, total = Math.ceil(ordens.length / LOTE);
    for (let t = 1; t <= MAX_TENT; t++) {
      try {
        const resp = await fetch(`${PORTAL_API_URL}/api/mes/sync-ordens`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${PORTAL_API_KEY}` },
          body: JSON.stringify({ ordens: lote, dataInicio: fmtData(dataInicio), dataFim: fmtData(dataFim), duracaoMs: duracaoSka }),
          timeout: 90000,
        });
        if (!resp.ok) throw new Error(`Portal ${resp.status}: ${(await resp.text().catch(()=>"")).slice(0,200)}`);
        const r = await resp.json();
        criados += r.criados || 0; atualizados += r.atualizados || 0;
        log(`    Lote ${n}/${total} (${lote.length}): ↑${r.criados} novos, ↻${r.atualizados} atualizados`);
        break;
      } catch (e) {
        if (t < MAX_TENT) { log(`    Lote ${n}/${total} tent.${t}/${MAX_TENT} falhou: ${e.message}. Aguardando 5s...`); await sleep(5000); }
        else throw new Error(`Lote ${n}/${total} falhou após ${MAX_TENT} tentativas: ${e.message}`);
      }
    }
  }
  return { criados, atualizados };
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  log("=== Início sync MES (dataset 150 — ordens planejadas) ===");
  const tInicio = Date.now();
  try {
    const hoje = new Date(); hoje.setHours(23, 59, 59, 0);
    let inicioTotal, fimTotal;
    if (ARG_START) {
      inicioTotal = new Date(ARG_START + "T00:00:00");
      if (isNaN(inicioTotal.getTime())) throw new Error(`--start inválido: "${ARG_START}". Use YYYY-MM-DD`);
      fimTotal = ARG_END ? new Date(ARG_END + "T23:59:59") : new Date(hoje);
      log(`Modo: backfill ${fmtData(inicioTotal)} → ${fmtData(fimTotal)}`);
    } else {
      fimTotal = new Date(hoje);
      inicioTotal = new Date(hoje); inicioTotal.setDate(inicioTotal.getDate() - SYNC_DIAS_ATRAS); inicioTotal.setHours(0,0,0,0);
      log(`Modo: sync normal — ${fmtData(inicioTotal)} → ${fmtData(fimTotal)} (${SYNC_DIAS_ATRAS} dias)`);
    }

    const blocos = dividirEmBlocos(inicioTotal, fimTotal, CHUNK_DIAS);
    log(`${blocos.length} bloco(s) de ${CHUNK_DIAS} dias | lote portal: 500`);

    const token = await skaLogin();
    let totalLinhas = 0, totalCriados = 0, totalAtualizados = 0, blocosErro = 0, camposLogados = false;

    for (let b = 0; b < blocos.length; b++) {
      const bl = blocos[b];
      log(`\n── Bloco ${b+1}/${blocos.length}: ${fmtData(bl.inicio)} → ${fmtData(bl.fim)} ──`);
      const tB = Date.now();
      let linhas;
      try { linhas = await skaFetchBloco(token, bl.inicio, bl.fim); }
      catch (e) { log(`  AVISO: SKA falhou: ${e.message}. Pulando.`); blocosErro++; await sleep(2000); continue; }

      if (linhas.length === 0) { log("  Vazio."); continue; }
      if (!camposLogados) { log(`  Campos: ${Object.keys(linhas[0]).join(", ")}`); camposLogados = true; }

      const ordens = linhas.map(transformarLinha).filter(Boolean);
      const ign = linhas.length - ordens.length;
      const naoIniciadas = ordens.filter(o => o.produzidoUn === 0 && o.planejadoUn > 0).length;
      log(`  ${linhas.length} linhas → ${ordens.length} válidas${ign>0?` (${ign} ignoradas)`:""} · ${naoIniciadas} não iniciadas`);
      if (ordens.length === 0) continue;

      let res;
      try { res = await enviarPortal(ordens, bl.inicio, bl.fim, Date.now() - tB); }
      catch (e) { log(`  ERRO portal: ${e.message}`); blocosErro++; await sleep(2000); continue; }

      totalLinhas += linhas.length; totalCriados += res.criados; totalAtualizados += res.atualizados;
      log(`  ✓ ${((Date.now()-tB)/1000).toFixed(1)}s — ↑${res.criados} | ↻${res.atualizados}`);
      if (b < blocos.length - 1) await sleep(1500);
    }

    log(`\n${"─".repeat(60)}`);
    log(`Sync concluído em ${((Date.now()-tInicio)/1000).toFixed(1)}s`);
    log(`Total linhas SKA : ${totalLinhas}`);
    log(`Criados          : ${totalCriados}`);
    log(`Atualizados      : ${totalAtualizados}`);
    if (blocosErro > 0) log(`Blocos com erro  : ${blocosErro}/${blocos.length}`);
  } catch (err) {
    log(`\nERRO FATAL: ${err.message}`);
    process.exit(1);
  }
  log("=== Fim sync MES ===\n");
}

main();
