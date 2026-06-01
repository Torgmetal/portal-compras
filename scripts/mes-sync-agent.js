/**
 * mes-sync-agent.js — Agente de sincronização MES SKA Syneco → Portal Torg
 *
 * Fonte: Dataset 242 — "04.4 Rastreabilidade de OP e Item [TORG] - Produção"
 *
 * INSTALAÇÃO em C:\MesSync\
 *   1. Copiar este arquivo para C:\MesSync\mes-sync-agent.js
 *   2. Copiar mes-sync-package.json para C:\MesSync\package.json
 *   3. Criar C:\MesSync\.env com as variáveis abaixo
 *   4. npm install
 *   5. Testar: node mes-sync-agent.js
 *   6. Agendar via Task Scheduler a cada 1 hora
 *
 * VARIÁVEIS DO .env
 *   SKA_API_URL=http://192.168.0.190:1000
 *   SKA_USER=seu_usuario
 *   SKA_PASS=sua_senha
 *   PORTAL_API_URL=https://workspace.torg.com.br
 *   PORTAL_API_KEY=6936b3a3783fd8f2b39b5083f3202d9f9b89016c8c12fc05f9ea0dbc3e967700
 *   SYNC_DIAS_ATRAS=1
 *
 * USO DA LINHA DE COMANDO
 *   node mes-sync-agent.js                          → sync padrão (SYNC_DIAS_ATRAS dias)
 *   node mes-sync-agent.js --dias 30                → últimos 30 dias
 *   node mes-sync-agent.js --start 2025-09-01       → de 01/09/2025 até hoje
 *   node mes-sync-agent.js --start 2025-09-01 --end 2026-05-01   → intervalo fixo
 *   node mes-sync-agent.js --chunk 60               → blocos de 60 dias no SKA (padrão: 30)
 *
 * BACKFILL HISTÓRICO (exemplo — buscar tudo desde set/2025)
 *   node mes-sync-agent.js --start 2025-09-01
 *   O agente divide automaticamente em blocos de 30 dias para não sobrecarregar o SKA.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const fetch = require("node-fetch");
const fs    = require("fs");

// ─── Argumentos de linha de comando ────────────────────────────────────────────
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
const CHUNK_DIAS      = ARG_CHUNK ? parseInt(ARG_CHUNK, 10) : 30; // dias por bloco SKA
const SKA_DATASET_ID  = "242";
const LOG_FILE        = process.env.LOG_FILE || path.join(__dirname, "mes-sync.log");

// ─── Utilitários ───────────────────────────────────────────────────────────────
function log(msg) {
  const linha = `[${new Date().toISOString()}] ${msg}`;
  console.log(linha);
  try { fs.appendFileSync(LOG_FILE, linha + "\n"); } catch (_) {}
}

function fmtISO(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtData(d) {
  return d.toISOString().split("T")[0];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Divide [start, end] em blocos de chunkDias dias
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

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Login SKA falhou (${resp.status}): ${txt.substring(0, 200)}`);
  }

  const data  = await resp.json();
  const token = data.data?.[0]?.token
    || data.token || data.accessToken || data.jwt
    || (typeof data === "string" ? data : null);

  if (!token) throw new Error("Token não encontrado: " + JSON.stringify(data).substring(0, 200));
  log(`Login OK — token ${token.length} chars`);
  return token;
}

// ─── Busca dataset 242 para um bloco de datas ──────────────────────────────────
async function skaFetchBloco(token, startDate, endDate) {
  const startStr = fmtISO(startDate);
  const endStr   = fmtISO(endDate);
  log(`  SKA fetch: ${startStr} → ${endStr}`);

  const qs = [
    "interval=0",
    `%23StartDate=${encodeURIComponent(startStr)}`,
    `%23EndDate=${encodeURIComponent(endStr)}`,
    "%23OP=Todos",
    "%23Item=Todos",
    "%23Obra=Todos",
    "%23Setor=Todos",
    "%23Status=TODOS",
    "%23Resource=Todos",
    "%23Resource_concat=Todos",
    "page=1",
    "pageSize=99999",
  ].join("&");

  const resp = await fetch(`${SKA_API_URL}/v1/dataset/${SKA_DATASET_ID}/run?${qs}`, {
    method: "GET",
    headers: { token },
    timeout: 180000, // 3 min por bloco — seguro mesmo com muitos registros
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Dataset ${SKA_DATASET_ID} erro (${resp.status}): ${txt.substring(0, 300)}`);
  }

  const data = await resp.json();
  const rows = Array.isArray(data) ? data : (data.data || data.rows || data.result || []);

  if (!Array.isArray(rows)) {
    throw new Error("Formato inesperado na resposta SKA: " + JSON.stringify(data).substring(0, 200));
  }

  return rows;
}

// ─── Transforma linha SKA → apontamento portal ─────────────────────────────────
function transformarLinha(row) {
  const productionId = row["ProductionID"] || row["ProductionId"] || row["productionID"];
  const obra         = String(row["Obra"] || "").trim();
  const dataInicio   = row["Data de Início"] || row["DataInicio"] || row["Data Inicio"];

  // Filtra linhas sem ProductionID, sem Obra, ou de uso interno
  if (!productionId)                                            return null;
  if (!obra || obra === "---" || obra.toLowerCase() === "todos") return null;
  if (obra.toUpperCase().includes("INTERNO"))                  return null;
  if (obra.toUpperCase().includes("MANUT"))                    return null;
  if (!dataInicio)                                              return null;

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
    produzidoUn:   parseFloat(String(row["Produzido"]    || "0").replace(",", ".")) || 0,
    rejeitado:     parseFloat(String(row["Rejeitado"]    || "0").replace(",", ".")) || 0,
    retrabalhado:  parseFloat(String(row["Retrabalhado"] || "0").replace(",", ".")) || 0,
    produzidoKg:   parseFloat(String(row["Peso"]         || "0").replace(",", ".")) || 0,
  };
}

// ─── Envia ao portal em lotes de 500 com retry (3 tentativas) ─────────────────
// O portal tem maxDuration=60s. Com LOTE=500 e processamento em batches de 10
// paralelos no servidor, cada chamada leva ~3-5s → seguro dentro do limite.
async function enviarPortal(apontamentos, dataInicio, dataFim, duracaoSka) {
  if (!PORTAL_API_KEY) throw new Error("PORTAL_API_KEY não configurada no .env");

  const LOTE          = 500;
  const MAX_TENTATIVAS = 3;
  let totalCriados = 0, totalAtualizados = 0;

  for (let i = 0; i < apontamentos.length; i += LOTE) {
    const lote      = apontamentos.slice(i, i + LOTE);
    const numLote   = Math.floor(i / LOTE) + 1;
    const totalLotes = Math.ceil(apontamentos.length / LOTE);

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        const resp = await fetch(`${PORTAL_API_URL}/api/mes/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${PORTAL_API_KEY}`,
          },
          body: JSON.stringify({
            apontamentos: lote,
            dataInicio: fmtData(dataInicio),
            dataFim:    fmtData(dataFim),
            duracaoMs:  duracaoSka,
          }),
          timeout: 90000, // 90s — superior ao maxDuration=60 do Vercel (margem de segurança)
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          throw new Error(`Portal ${resp.status}: ${txt.substring(0, 200)}`);
        }

        const result = await resp.json();
        totalCriados    += result.criados    || 0;
        totalAtualizados += result.atualizados || 0;
        log(`    Lote ${numLote}/${totalLotes} (${lote.length} reg): ↑${result.criados} novos, ↻${result.atualizados} atualizados`);
        break; // sucesso — sai do loop de retry

      } catch (e) {
        if (tentativa < MAX_TENTATIVAS) {
          log(`    Lote ${numLote}/${totalLotes} — tentativa ${tentativa}/${MAX_TENTATIVAS} falhou: ${e.message}. Aguardando 5s...`);
          await sleep(5000);
        } else {
          throw new Error(`Lote ${numLote}/${totalLotes} falhou após ${MAX_TENTATIVAS} tentativas: ${e.message}`);
        }
      }
    }
  }

  return { criados: totalCriados, atualizados: totalAtualizados };
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  log("=== Início sync MES ===");
  const tInicio = Date.now();

  try {
    // ── Determina período total ────────────────────────────────────────────────
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 0);

    let inicioTotal, fimTotal;

    if (ARG_START) {
      // Backfill com data explícita: --start 2025-09-01 [--end 2026-01-01]
      inicioTotal = new Date(ARG_START + "T00:00:00");
      if (isNaN(inicioTotal.getTime())) {
        throw new Error(`--start inválido: "${ARG_START}". Use o formato YYYY-MM-DD (ex: 2025-09-01)`);
      }
      fimTotal = ARG_END ? new Date(ARG_END + "T23:59:59") : new Date(hoje);
      if (ARG_END && isNaN(fimTotal.getTime())) {
        throw new Error(`--end inválido: "${ARG_END}". Use o formato YYYY-MM-DD`);
      }
      log(`Modo: backfill ${fmtData(inicioTotal)} → ${fmtData(fimTotal)}`);
    } else {
      // Modo normal: N dias atrás
      fimTotal    = new Date(hoje);
      inicioTotal = new Date(hoje);
      inicioTotal.setDate(inicioTotal.getDate() - SYNC_DIAS_ATRAS);
      inicioTotal.setHours(0, 0, 0, 0);
      log(`Modo: sync normal — ${fmtData(inicioTotal)} → ${fmtData(fimTotal)} (${SYNC_DIAS_ATRAS} dias)`);
    }

    // ── Divide em blocos para não travar o SKA ─────────────────────────────────
    const blocos = dividirEmBlocos(inicioTotal, fimTotal, CHUNK_DIAS);
    const totalDias = Math.round((fimTotal - inicioTotal) / 86400000) + 1;
    log(`Período: ${totalDias} dias | ${blocos.length} bloco(s) de ${CHUNK_DIAS} dias | lote portal: 500 reg`);

    // ── Login SKA (uma vez — token dura horas) ─────────────────────────────────
    const token = await skaLogin();

    let totalLinhas = 0, totalCriados = 0, totalAtualizados = 0, blocosComErro = 0;
    let camposLogados = false;

    // ── Processa cada bloco ────────────────────────────────────────────────────
    for (let b = 0; b < blocos.length; b++) {
      const bloco = blocos[b];
      log(`\n── Bloco ${b + 1}/${blocos.length}: ${fmtData(bloco.inicio)} → ${fmtData(bloco.fim)} ──`);

      const tBloco = Date.now();
      let linhas;

      try {
        linhas = await skaFetchBloco(token, bloco.inicio, bloco.fim);
      } catch (e) {
        log(`  AVISO: SKA falhou neste bloco: ${e.message}. Pulando.`);
        blocosComErro++;
        await sleep(2000);
        continue;
      }

      if (linhas.length === 0) {
        log(`  Vazio — sem apontamentos neste período`);
        continue;
      }

      // Loga campos apenas no primeiro bloco com dados
      if (!camposLogados) {
        log(`  Campos: ${Object.keys(linhas[0]).join(", ")}`);
        camposLogados = true;
      }

      const apontamentos = linhas.map(transformarLinha).filter(Boolean);
      const ignorados    = linhas.length - apontamentos.length;
      log(`  ${linhas.length} linhas SKA → ${apontamentos.length} válidos${ignorados > 0 ? ` (${ignorados} ignorados)` : ""}`);

      if (apontamentos.length === 0) continue;

      let resultado;
      try {
        resultado = await enviarPortal(apontamentos, bloco.inicio, bloco.fim, Date.now() - tBloco);
      } catch (e) {
        log(`  ERRO ao enviar ao portal: ${e.message}`);
        blocosComErro++;
        await sleep(2000);
        continue;
      }

      totalLinhas     += linhas.length;
      totalCriados    += resultado.criados;
      totalAtualizados += resultado.atualizados;

      log(`  ✓ ${((Date.now() - tBloco) / 1000).toFixed(1)}s — ↑${resultado.criados} novos | ↻${resultado.atualizados} atualizados`);

      // Pausa entre blocos para não sobrecarregar o portal
      if (b < blocos.length - 1) await sleep(1500);
    }

    // ── Resumo final ───────────────────────────────────────────────────────────
    const duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
    log(`\n${"─".repeat(60)}`);
    log(`Sync concluído em ${duracaoTotal}s`);
    log(`Total linhas SKA : ${totalLinhas}`);
    log(`Criados (novos)  : ${totalCriados}`);
    log(`Atualizados      : ${totalAtualizados}`);
    if (blocosComErro > 0) log(`Blocos com erro  : ${blocosComErro}/${blocos.length} (verifique o log)`);

  } catch (err) {
    log(`\nERRO FATAL: ${err.message}`);
    if (err.stack) log(err.stack.split("\n").slice(1, 4).join(" | "));
    process.exit(1);
  }

  log("=== Fim sync MES ===\n");
}

main();
