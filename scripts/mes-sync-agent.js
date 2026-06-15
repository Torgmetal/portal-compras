/**
 * mes-sync-agent.js — Agente de sincronização MES SKA Syneco → Portal Torg
 *
 * Roda DOIS syncs em sequência (uma execução agendada cobre os dois):
 *
 * 1. APONTAMENTOS — Dataset 242 "04.4 Rastreabilidade de OP e Item [TORG] - Produção"
 *    Eventos de produção (ProductionID único) → POST /api/mes/sync
 *    Janela: últimos SYNC_DIAS_ATRAS dias (padrão 2 — cobre viradas de dia).
 *    ⚠️ Este fluxo alimenta o Controle de Produção/Syneco do portal. Ele foi
 *    perdido na reescrita de 01/06/2026 (Fase 1 dataset 150) e restaurado aqui.
 *
 * 2. ORDENS — Dataset 150 "TORG_Production_Traceability_Detalhado"
 *    Snapshot planejado vs produzido (acumulado) → POST /api/mes/sync-ordens
 *    Janela: últimos 3 anos (padrão), dividida automaticamente contra o teto de 100k.
 *
 * INSTALAÇÃO em C:\MesSync\
 *   1. Copiar este arquivo para C:\MesSync\mes-sync-agent.js
 *   2. Copiar mes-sync-package.json para C:\MesSync\package.json
 *   3. Criar C:\MesSync\.env com as variáveis abaixo
 *   4. npm install
 *   5. Testar: node mes-sync-agent.js --so-apontamentos
 *   6. Rodar continuamente (RECOMENDADO): node mes-sync-agent.js --loop
 *      → apontamentos a cada 10 min + ordens a cada 60 min, num processo só.
 *      Mantenha o processo vivo via Task Scheduler (gatilho "Ao iniciar o
 *      sistema", "Reiniciar em caso de falha") ou um serviço (nssm).
 *      ALTERNATIVA sem processo fixo: duas tarefas one-shot no Task Scheduler —
 *        a cada 10 min:  node mes-sync-agent.js --so-apontamentos
 *        a cada 60 min:  node mes-sync-agent.js --so-ordens
 *      NUNCA agende o run completo (apontamentos+ordens) a cada 10 min: o
 *      snapshot de ordens (3 anos) estoura a memória da compute do Neon.
 *
 * VARIÁVEIS DO .env
 *   SKA_API_URL=http://192.168.0.190:1000
 *   SKA_USER=...
 *   SKA_PASS=...
 *   PORTAL_API_URL=https://workspace.torg.com.br
 *   PORTAL_API_KEY=...   (mesma MES_SYNC_API_KEY do portal — NUNCA commitar o valor)
 *   SYNC_DIAS_ATRAS=2          (janela dos apontamentos, em dias)
 *   ORDENS_DIAS_ATRAS=60       (janela do snapshot de ordens, em dias — use após o
 *                               backfill; sem ela o padrão é 3 anos, p/ carga inicial)
 *   APONT_INTERVAL_MIN=10      (loop: intervalo dos apontamentos, em min)
 *   ORDENS_INTERVAL_MIN=60     (loop: intervalo das ordens, em min)
 *
 * USO
 *   node mes-sync-agent.js --loop                   → LOOP: apontamentos 10min + ordens 60min
 *   node mes-sync-agent.js --loop --so-apontamentos → LOOP só de apontamentos (10 min)
 *   node mes-sync-agent.js                          → 1x: apontamentos (2 dias) + ordens (3 anos)
 *   node mes-sync-agent.js --apont-dias 15          → apontamentos dos últimos 15 dias (backfill)
 *   node mes-sync-agent.js --apont-start 2026-06-01 → apontamentos desde 01/06 (backfill de buraco)
 *   node mes-sync-agent.js --so-apontamentos        → 1x: só o sync de apontamentos
 *   node mes-sync-agent.js --so-ordens              → 1x: só o snapshot de ordens (plano + produzido)
 *   node mes-sync-agent.js --so-ordens --produzidas → 1x: ordens só das linhas COM produção (leve, p/ horária)
 *   node mes-sync-agent.js --start 2025-01-01       → ordens: snapshot desde 01/01/2025
 *   node mes-sync-agent.js --anos 2                 → ordens: snapshot dos últimos 2 anos
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
const temFlag = (name) => process.argv.slice(2).includes(`--${name}`);

const ARG_START       = getArg("start");        // ordens
const ARG_ANOS        = getArg("anos");         // ordens
const ARG_APONT_DIAS  = getArg("apont-dias");   // apontamentos
const ARG_APONT_START = getArg("apont-start");  // apontamentos (backfill)
const SO_APONTAMENTOS = temFlag("so-apontamentos");
const SO_ORDENS       = temFlag("so-ordens");
const SO_PRODUZIDAS   = temFlag("produzidas");    // ordens: envia só as linhas COM produção
const LOOP            = temFlag("loop");          // roda continuamente (auto-agenda)
const APONT_INTERVAL_MIN  = parseInt(process.env.APONT_INTERVAL_MIN  || "10", 10); // apontamentos a cada N min
const ORDENS_INTERVAL_MIN = parseInt(process.env.ORDENS_INTERVAL_MIN || "60", 10); // ordens a cada M min

const SKA_API_URL    = (process.env.SKA_API_URL    || "http://192.168.0.190:1000").replace(/\/$/, "");
const SKA_USER       = process.env.SKA_USER;
const SKA_PASS       = process.env.SKA_PASS;
const PORTAL_API_URL = (process.env.PORTAL_API_URL || "https://workspace.torg.com.br").replace(/\/$/, "");
const PORTAL_API_KEY = process.env.PORTAL_API_KEY;
const DATASET_ORDENS       = "150";
const DATASET_APONTAMENTOS = "242";
const SYNC_DIAS_ATRAS = ARG_APONT_DIAS ? parseInt(ARG_APONT_DIAS, 10) : parseInt(process.env.SYNC_DIAS_ATRAS || "2", 10);
const LOG_FILE       = process.env.LOG_FILE || path.join(__dirname, "mes-sync.log");

function log(msg) {
  const linha = `[${new Date().toISOString()}] ${msg}`;
  console.log(linha);
  try { fs.appendFileSync(LOG_FILE, linha + "\n"); } catch (_) {}
}

const p = (n) => String(n).padStart(2, "0");
function fmtISO(d) {
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtData(d) {
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const num = (v) => parseFloat(String(v ?? "0").replace(",", ".")) || 0;

const CAP_SKA = 99999; // teto de linhas por resposta do SKA
const DIA_MS  = 24 * 60 * 60 * 1000;

// ─── SKA: login + fetch genérico por dataset ────────────────────────────────────
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
  const token = data.data?.[0]?.token || data.token || data.accessToken || data.jwt || (typeof data === "string" ? data : null);
  if (!token) throw new Error("Token não encontrado: " + JSON.stringify(data).slice(0, 200));
  log(`Login OK — token ${token.length} chars`);
  return token;
}

async function skaFetchRange(token, dataset, ini, fim) {
  const qs = [
    "interval=0",
    `%23StartDate=${encodeURIComponent(fmtISO(ini))}`,
    `%23EndDate=${encodeURIComponent(fmtISO(fim))}`,
    "%23OP=Todos", "%23Item=Todos", "%23Obra=Todos",
    "%23Setor=Todos", "%23Status=TODOS",
    "%23Resource=Todos", "%23Resource_concat=Todos",
    "page=1", "pageSize=99999",
  ].join("&");
  const resp = await fetch(`${SKA_API_URL}/v1/dataset/${dataset}/run?${qs}`, {
    method: "GET", headers: { token }, timeout: 300000,
  });
  if (!resp.ok) throw new Error(`Dataset ${dataset} erro (${resp.status}): ${(await resp.text().catch(()=>"")).slice(0,300)}`);
  const data = await resp.json();
  const rows = Array.isArray(data) ? data : (data.data || data.rows || data.result || []);
  if (!Array.isArray(rows)) throw new Error("Formato inesperado: " + JSON.stringify(data).slice(0,200));
  return rows;
}

// Busca recursiva: divide a janela se bater no teto de 100k.
async function skaFetchJanela(token, dataset, ini, fim, prof = 0) {
  const rows = await skaFetchRange(token, dataset, ini, fim);
  const ind = "  ".repeat(prof);
  log(`${ind}janela ${fmtData(ini)} → ${fmtData(fim)}: ${rows.length} linhas${rows.length >= CAP_SKA ? " (teto → dividindo)" : ""}`);
  if (rows.length >= CAP_SKA && (fim - ini) > DIA_MS) {
    const meio = new Date((ini.getTime() + fim.getTime()) / 2); meio.setHours(23, 59, 59, 0);
    const prox = new Date(meio.getTime() + DIA_MS); prox.setHours(0, 0, 0, 0);
    const a = await skaFetchJanela(token, dataset, ini, meio, prof + 1);
    const b = await skaFetchJanela(token, dataset, prox, fim, prof + 1);
    return a.concat(b);
  }
  return rows;
}

// ════════════════════════════════════════════════════════════════════════════════
// FLUXO 1 — APONTAMENTOS (dataset 242 → /api/mes/sync)
// ════════════════════════════════════════════════════════════════════════════════

// Transforma linha do dataset 242 → apontamento do portal
function transformarApontamento(row) {
  const productionId = row["ProductionID"] || row["ProductionId"] || row["productionID"];
  const obra         = String(row["Obra"] || "").trim();
  const dataInicio   = row["Data de Início"] || row["DataInicio"] || row["Data Inicio"];

  if (!productionId)                                             return null;
  if (!obra || obra === "---" || obra.toLowerCase() === "todos") return null;
  if (obra.toUpperCase().includes("INTERNO"))                    return null;
  if (obra.toUpperCase().includes("MANUT"))                      return null;
  if (!dataInicio)                                               return null;

  return {
    productionId:  Number(productionId),
    dataInicio:    String(dataInicio).trim(),
    dataFim:       row["Data de Fim"] ? String(row["Data de Fim"]).trim() : null,
    obra,
    opSka:         String(row["OP"]            || "").trim() || null,
    setor:         String(row["Setor"]         || "").trim() || null,
    maquina:       String(row["Máquina"]       || row["Maquina"]  || "").trim() || null,
    codigoMaquina: String(row["Código"]        || row["Codigo"]   || "").trim() || null,
    operacao:      String(row["Operação"]      || row["Operacao"] || "").trim() || null,
    descricaoItem: String(row["Desc. Item"]    || row["DescItem"] || "").trim() || null,
    operador:      String(row["Operador"]      || "").trim() || null,
    status:        String(row["Status"]        || "").trim() || null,
    produzidoUn:   num(row["Produzido"]),
    rejeitado:     num(row["Rejeitado"]),
    retrabalhado:  num(row["Retrabalhado"]),
    produzidoKg:   num(row["Peso"]),
  };
}

// Envia apontamentos em lotes de 500 com retry
async function enviarApontamentos(apontamentos, dataInicio, dataFim, duracaoSka) {
  if (!PORTAL_API_KEY) throw new Error("PORTAL_API_KEY não configurada no .env");
  const LOTE = 500, MAX_TENT = 3;
  let criados = 0, atualizados = 0;

  for (let i = 0; i < apontamentos.length; i += LOTE) {
    const lote = apontamentos.slice(i, i + LOTE);
    const nLote = Math.floor(i / LOTE) + 1, total = Math.ceil(apontamentos.length / LOTE);
    for (let t = 1; t <= MAX_TENT; t++) {
      try {
        const resp = await fetch(`${PORTAL_API_URL}/api/mes/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${PORTAL_API_KEY}` },
          body: JSON.stringify({ apontamentos: lote, dataInicio: fmtData(dataInicio), dataFim: fmtData(dataFim), duracaoMs: duracaoSka }),
          timeout: 90000,
        });
        if (!resp.ok) throw new Error(`Portal ${resp.status}: ${(await resp.text().catch(()=>"")).slice(0,200)}`);
        const r = await resp.json();
        criados += r.criados || 0; atualizados += r.atualizados || 0;
        log(`  [apont] Lote ${nLote}/${total} (${lote.length}): ↑${r.criados} novos, ↻${r.atualizados} atualizados`);
        break;
      } catch (e) {
        if (t < MAX_TENT) {
          log(`  [apont] Lote ${nLote}/${total} tent.${t}/${MAX_TENT} falhou: ${e.message}. Aguardando 5s...`);
          await sleep(5000);
        } else throw new Error(`Lote ${nLote}/${total} falhou após ${MAX_TENT} tentativas: ${e.message}`);
      }
    }
  }
  return { criados, atualizados };
}

async function syncApontamentos(token) {
  log("── Sync APONTAMENTOS (dataset 242) ──");
  const fim = new Date(); fim.setHours(23, 59, 59, 0);
  let ini;
  if (ARG_APONT_START) {
    ini = new Date(ARG_APONT_START + "T00:00:00");
    if (isNaN(ini.getTime())) throw new Error(`--apont-start inválido: "${ARG_APONT_START}". Use YYYY-MM-DD`);
  } else {
    ini = new Date(fim.getTime() - SYNC_DIAS_ATRAS * DIA_MS); ini.setHours(0, 0, 0, 0);
  }
  log(`Janela apontamentos: ${fmtData(ini)} → ${fmtData(fim)}`);

  const tFetch = Date.now();
  const linhas = await skaFetchJanela(token, DATASET_APONTAMENTOS, ini, fim);
  const duracaoSka = Date.now() - tFetch;
  log(`SKA retornou ${linhas.length} linhas em ${(duracaoSka/1000).toFixed(1)}s`);

  const apontamentos = linhas.map(transformarApontamento).filter(Boolean);
  const ign = linhas.length - apontamentos.length;
  log(`${apontamentos.length} apontamentos válidos${ign > 0 ? ` (${ign} ignorados)` : ""}`);
  if (apontamentos.length === 0) { log("Nada a enviar (apontamentos)."); return; }

  const r = await enviarApontamentos(apontamentos, ini, fim, duracaoSka);
  log(`Apontamentos OK: ${r.criados} novos, ${r.atualizados} atualizados`);
}

// ════════════════════════════════════════════════════════════════════════════════
// FLUXO 2 — ORDENS (dataset 150 → /api/mes/sync-ordens, snapshot)
// ════════════════════════════════════════════════════════════════════════════════

// Busca o snapshot completo em janelas e junta por chave (MAX produzido).
async function skaFetchSnapshot(token, startDate, endDate) {
  log(`SKA fetch (janelas): ${fmtISO(startDate)} → ${fmtISO(endDate)}`);
  const todas = await skaFetchJanela(token, DATASET_ORDENS, startDate, endDate);
  const map = new Map();
  for (const r of todas) {
    const k = `${r["Obra"]}|${r["OP"]}|${r["Operação"] || r["Operacao"]}|${r["Item"]}`;
    const prev = map.get(k);
    if (!prev || num(r["Produzido"]) > num(prev["Produzido"])) map.set(k, r);
  }
  const uniq = [...map.values()];
  log(`Total bruto ${todas.length} → ${uniq.length} linhas únicas (após juntar janelas)`);
  return uniq;
}

function transformarOrdem(row) {
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
async function enviarOrdens(ordens, dataInicio, dataFim) {
  if (!PORTAL_API_KEY) throw new Error("PORTAL_API_KEY não configurada no .env");
  const LOTE      = Number(process.env.LOTE      || 1000);
  const PAUSA_MS  = Number(process.env.PAUSA_MS  || 300);
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
        log(`  [ordens] Lote ${nLote}/${total} (${lote.length}): ✓ ${r.processados ?? "?"} processados`);
        break;
      } catch (e) {
        if (t < MAX_TENT) {
          // backoff crescente — dá tempo da compute recuperar memória
          const espera = 5000 * t;
          log(`  [ordens] Lote ${nLote}/${total} tent.${t}/${MAX_TENT} falhou: ${e.message}. Aguardando ${espera/1000}s...`);
          await sleep(espera);
        } else throw new Error(`Lote ${nLote}/${total} falhou após ${MAX_TENT} tentativas: ${e.message}`);
      }
    }
    if (i + LOTE < ordens.length) await sleep(PAUSA_MS);
  }
  return { processados };
}

async function syncOrdens(token) {
  log("── Sync ORDENS (dataset 150 — snapshot) ──");
  const hoje = new Date(); hoje.setHours(23, 59, 59, 0);
  // Prioridade da janela: --start > --anos > ORDENS_DIAS_ATRAS (env) > 3 anos.
  // Com o histórico já carregado, o dia a dia só precisa de poucos dias: as OPs
  // ativas recentes seguem atualizando; as antigas mantêm o estado já sincronizado.
  let inicio;
  if (ARG_START) {
    inicio = new Date(ARG_START + "T00:00:00");
    if (isNaN(inicio.getTime())) throw new Error(`--start inválido: "${ARG_START}". Use YYYY-MM-DD`);
  } else if (ARG_ANOS) {
    inicio = new Date(hoje); inicio.setFullYear(inicio.getFullYear() - parseInt(ARG_ANOS, 10)); inicio.setHours(0, 0, 0, 0);
  } else if (process.env.ORDENS_DIAS_ATRAS) {
    const dias = parseInt(process.env.ORDENS_DIAS_ATRAS, 10) || 60;
    inicio = new Date(hoje.getTime() - dias * DIA_MS); inicio.setHours(0, 0, 0, 0);
  } else {
    inicio = new Date(hoje); inicio.setFullYear(inicio.getFullYear() - 3); inicio.setHours(0, 0, 0, 0);
  }
  log(`Período (snapshot): ${fmtData(inicio)} → ${fmtData(hoje)}`);

  const tFetch = Date.now();
  const linhas = await skaFetchSnapshot(token, inicio, hoje);
  log(`SKA retornou ${linhas.length} linhas em ${((Date.now()-tFetch)/1000).toFixed(1)}s`);

  let ordens = linhas.map(transformarOrdem).filter(Boolean);
  const ign = linhas.length - ordens.length;
  const naoIniciadas = ordens.filter(o => o.produzidoUn === 0 && o.planejadoUn > 0).length;
  log(`${ordens.length} válidas${ign>0?` (${ign} ignoradas)`:""} · ${naoIniciadas} não iniciadas`);

  // --produzidas: na sincronização HORÁRIA, envia só as linhas COM produção
  // (pula as planejadas/não iniciadas, que não mudam de hora em hora — a carga
  // diária leva o plano completo). Deixa a horária leve (~milhares em vez de ~50k).
  if (SO_PRODUZIDAS) {
    const antes = ordens.length;
    ordens = ordens.filter(o => o.produzidoUn > 0 || o.pesoProduzido > 0 || o.rejeitadoUn > 0);
    log(`Filtro --produzidas: ${ordens.length} linhas com produção (de ${antes})`);
  }

  if (ordens.length === 0) { log("Nada a enviar (ordens)."); return; }

  const res = await enviarOrdens(ordens, inicio, hoje);
  log(`Ordens OK: ${res.processados} processadas`);
}

// ─── Um ciclo: login + apontamentos (sempre) + ordens (quando pedido) ──────────
// Não chama process.exit — devolve o nº de fluxos com erro (para o loop seguir).
async function rodarCiclo(comOrdens) {
  const t0 = Date.now();
  let falhas = 0;

  let token;
  try {
    token = await skaLogin();
  } catch (err) {
    log(`ERRO (login SKA): ${err.message}`);
    return 1; // sem token não dá pra fazer nada neste ciclo
  }

  if (!SO_ORDENS) {
    try { await syncApontamentos(token); }
    catch (err) { falhas++; log(`ERRO no sync de APONTAMENTOS: ${err.message}`); }
  }

  if (comOrdens && !SO_APONTAMENTOS) {
    try { await syncOrdens(token); }
    catch (err) { falhas++; log(`ERRO no sync de ORDENS: ${err.message}`); }
  }

  log(`${"─".repeat(60)}`);
  log(`Ciclo concluído em ${((Date.now()-t0)/1000).toFixed(1)}s${falhas ? ` — ${falhas} fluxo(s) com ERRO` : ""}`);
  return falhas;
}

// ─── Execução única (Task Scheduler one-shot) ──────────────────────────────────
async function rodarUmaVez() {
  log("=== Início sync MES (execução única: apontamentos 242 + ordens 150) ===");
  const falhas = await rodarCiclo(true);
  log("=== Fim sync MES ===\n");
  if (falhas > 0) process.exit(1);
}

// ─── Loop contínuo: apontamentos a cada N min, ordens a cada M min ─────────────
// Roda como processo único. Apontamentos é leve (dataset 242, janela curta);
// ordens é pesado (snapshot 3 anos, dataset 150) — por isso intervalo maior,
// senão a compute do Neon estoura de memória.
async function rodarEmLoop() {
  const apontMs  = Math.max(APONT_INTERVAL_MIN, 1) * 60000;
  const ordensMs = Math.max(ORDENS_INTERVAL_MIN, 1) * 60000;
  const fazOrdens = !SO_APONTAMENTOS;
  log(`=== Agente MES em LOOP — apontamentos a cada ${APONT_INTERVAL_MIN}min` +
      `${fazOrdens ? `, ordens a cada ${ORDENS_INTERVAL_MIN}min` : " (só apontamentos)"} ===`);

  let proxOrdens = 0; // 0 = roda ordens já na primeira volta
  // Loop infinito — erros de um ciclo nunca derrubam o processo.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const t = Date.now();
    const comOrdens = fazOrdens && t >= proxOrdens;
    try { await rodarCiclo(comOrdens); }
    catch (err) { log(`ERRO inesperado no ciclo: ${err.message}`); }
    if (comOrdens) proxOrdens = Date.now() + ordensMs;

    const espera = Math.max(apontMs - (Date.now() - t), 5000);
    log(`Próximo ciclo de apontamentos em ~${(espera / 60000).toFixed(1)}min.\n`);
    await sleep(espera);
  }
}

if (LOOP) rodarEmLoop();
else rodarUmaVez();
