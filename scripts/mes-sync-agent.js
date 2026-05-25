/**
 * mes-sync-agent.js — Agente de sincronização MES SKA Syneco → Portal Torg
 *
 * Fonte de dados: Dataset 242 — "04.4 Rastreabilidade de OP e Item [TORG] - Produção"
 * Report 263 no SKA Reports (04 - Controle de Produção > 04.4)
 *
 * Instalar em C:\MesSync\ (ou pasta de preferência):
 *   1. Copiar este arquivo para C:\MesSync\mes-sync-agent.js
 *   2. Copiar mes-sync-package.json para C:\MesSync\package.json
 *   3. Criar C:\MesSync\.env com as variáveis abaixo
 *   4. npm install
 *   5. Testar: node mes-sync-agent.js
 *   6. Agendar via Task Scheduler a cada 1 hora
 *
 * .env necessário:
 *   SKA_API_URL=http://192.168.0.190:1000
 *   SKA_USER=seu_usuario
 *   SKA_PASS=sua_senha
 *   PORTAL_API_URL=https://workspace.torg.com.br
 *   PORTAL_API_KEY=6936b3a3783fd8f2b39b5083f3202d9f9b89016c8c12fc05f9ea0dbc3e967700
 *   SYNC_DIAS_ATRAS=1
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const fetch  = require("node-fetch");
const fs     = require("fs");

// ─── Configuração ──────────────────────────────────────────────
const SKA_API_URL    = (process.env.SKA_API_URL || "http://192.168.0.190:1000").replace(/\/$/, "");
const SKA_USER       = process.env.SKA_USER;
const SKA_PASS       = process.env.SKA_PASS;
const PORTAL_API_URL = (process.env.PORTAL_API_URL || "https://workspace.torg.com.br").replace(/\/$/, "");
const PORTAL_API_KEY = process.env.PORTAL_API_KEY;
const SYNC_DIAS_ATRAS = parseInt(process.env.SYNC_DIAS_ATRAS || "1", 10);
const LOG_FILE        = process.env.LOG_FILE || path.join(__dirname, "mes-sync.log");

// Dataset 242 = "04.4 Rastreabilidade de OP e Item [TORG] - Produção"
const SKA_DATASET_ID  = "242";

// ─── Utilitários ───────────────────────────────────────────────
function log(msg) {
  const linha = `[${new Date().toISOString()}] ${msg}`;
  console.log(linha);
  try { fs.appendFileSync(LOG_FILE, linha + "\n"); } catch (_) {}
}

// Formata Date para "YYYY-MM-DDTHH:mm:ss" (formato aceito pelo SKA dataset 242)
function fmtISO(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ─── Login SKA ─────────────────────────────────────────────────
async function skaLogin() {
  if (!SKA_USER || !SKA_PASS) throw new Error("SKA_USER e SKA_PASS não configurados no .env");

  const resp = await fetch(`${SKA_API_URL}/v1/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: SKA_USER, password: SKA_PASS }),
    timeout: 15000,
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Login SKA falhou (${resp.status}): ${txt.substring(0, 200)}`);
  }

  const data = await resp.json();
  const token = data.token || data.accessToken || data.jwt || data.Token
    || (typeof data === "string" ? data : null);

  if (!token) throw new Error("Token não encontrado na resposta: " + JSON.stringify(data).substring(0, 200));
  log(`Login OK — token ${token.length} chars`);
  return token;
}

// ─── Busca dataset 242 com paginação ───────────────────────────
async function skaFetchDataset242(token, startDate, endDate) {
  const allRows = [];
  let page = 1;
  const PAGE_SIZE = 500;

  const startStr = fmtISO(startDate);
  const endStr   = fmtISO(endDate);
  log(`Buscando dataset 242: ${startStr} → ${endStr}`);

  while (true) {
    // Parâmetros com prefixo # (URL-encoded como %23) — formato exigido pelo SKA dataset 242
    // Valores "Todos" = sem filtro (retorna tudo)
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
      `page=${page}`,
      `pageSize=${PAGE_SIZE}`,
    ].join("&");

    log(`  Página ${page}...`);
    const resp = await fetch(`${SKA_API_URL}/v1/dataset/${SKA_DATASET_ID}/run?${qs}`, {
      method: "GET",
      headers: { token },
      timeout: 60000,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Dataset ${SKA_DATASET_ID} erro (${resp.status}): ${txt.substring(0, 300)}`);
    }

    const data = await resp.json();
    const rows = Array.isArray(data) ? data
      : (data.data || data.rows || data.result || []);

    if (!Array.isArray(rows)) {
      throw new Error("Formato inesperado: " + JSON.stringify(data).substring(0, 200));
    }

    allRows.push(...rows);
    log(`  Página ${page}: ${rows.length} registros (total: ${allRows.length})`);

    if (rows.length < PAGE_SIZE) break;  // última página
    page++;
    if (page > 50) { log("  AVISO: limite de 50 páginas atingido"); break; }
  }

  log(`Total SKA: ${allRows.length} registros`);

  // Log diagnóstico dos campos (primeira vez ou quando há dados)
  if (allRows.length > 0 && page === 1) {
    log(`Campos do dataset: ${Object.keys(allRows[0]).join(", ")}`);
  }

  return allRows;
}

// ─── Transforma linha SKA → apontamento portal ─────────────────
function transformarLinha(row) {
  // Mapeamento dos campos do dataset 242
  // Campos confirmados: OP, Operação, Setor, Item, "Desc. Item", Código, Máquina,
  // "Cód. Operador", Operador, "Data de Início", "Data de Fim",
  // Produzido, Rejeitado, Retrabalhado, Status, Peso, Obra, ProductionID

  const productionId = row["ProductionID"] || row["ProductionId"] || row["productionID"];
  const obra         = String(row["Obra"] || "").trim();
  const dataInicio   = row["Data de Início"] || row["DataInicio"] || row["Data Inicio"];

  // ProductionID e Obra são obrigatórios
  if (!productionId || !obra || obra === "---" || obra.toLowerCase() === "todos") return null;
  // Ignora OPs internas (USO-INTERNO, etc.)
  if (obra.toUpperCase().includes("INTERNO") || obra.toUpperCase().includes("MANUT")) return null;

  return {
    productionId:  Number(productionId),
    dataInicio:    dataInicio ? String(dataInicio).trim() : null,
    dataFim:       row["Data de Fim"] ? String(row["Data de Fim"]).trim() : null,
    obra,
    opSka:         String(row["OP"] || "").trim() || null,
    setor:         String(row["Setor"] || "").trim() || null,
    maquina:       String(row["Máquina"] || row["Maquina"] || "").trim() || null,
    codigoMaquina: String(row["Código"] || row["Codigo"] || "").trim() || null,
    operacao:      String(row["Operação"] || row["Operacao"] || "").trim() || null,
    descricaoItem: String(row["Desc. Item"] || row["DescItem"] || "").trim() || null,
    operador:      String(row["Operador"] || "").trim() || null,
    status:        String(row["Status"] || "").trim() || null,
    produzidoUn:   parseFloat(String(row["Produzido"] || "0").replace(",", ".")) || 0,
    rejeitado:     parseFloat(String(row["Rejeitado"] || "0").replace(",", ".")) || 0,
    retrabalhado:  parseFloat(String(row["Retrabalhado"] || "0").replace(",", ".")) || 0,
    produzidoKg:   parseFloat(String(row["Peso"] || "0").replace(",", ".")) || 0,
  };
}

// ─── Envia ao portal ────────────────────────────────────────────
async function enviarPortal(apontamentos, dataInicio, dataFim, duracaoSka) {
  if (!PORTAL_API_KEY) throw new Error("PORTAL_API_KEY não configurada no .env");
  log(`Enviando ${apontamentos.length} apontamentos ao portal...`);

  // Envia em lotes de 1000 para não exceder limite de payload
  const LOTE = 1000;
  let totalCriados = 0, totalAtualizados = 0;
  let lastSyncId = null;

  for (let i = 0; i < apontamentos.length; i += LOTE) {
    const lote = apontamentos.slice(i, i + LOTE);
    const resp = await fetch(`${PORTAL_API_URL}/api/mes/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PORTAL_API_KEY}`,
      },
      body: JSON.stringify({
        apontamentos: lote,
        dataInicio: dataInicio.toISOString().split("T")[0],
        dataFim:    dataFim.toISOString().split("T")[0],
        duracaoMs:  duracaoSka,
      }),
      timeout: 120000,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Portal retornou ${resp.status}: ${txt.substring(0, 300)}`);
    }

    const result = await resp.json();
    totalCriados    += result.criados    || 0;
    totalAtualizados += result.atualizados || 0;
    lastSyncId = result.syncId;
    log(`  Lote ${Math.floor(i/LOTE)+1}: criados=${result.criados}, atualizados=${result.atualizados}`);
  }

  return { criados: totalCriados, atualizados: totalAtualizados, syncId: lastSyncId };
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  log("=== Início sync MES ===");
  const tInicio = Date.now();

  try {
    const hoje = new Date();
    hoje.setSeconds(59); hoje.setMinutes(59); hoje.setHours(23);
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - SYNC_DIAS_ATRAS);
    inicio.setHours(0); inicio.setMinutes(0); inicio.setSeconds(0);

    // 1. Login
    const token = await skaLogin();

    // 2. Busca dados
    const tSka = Date.now();
    const linhas = await skaFetchDataset242(token, inicio, hoje);
    const duracaoSka = Date.now() - tSka;

    if (linhas.length === 0) {
      log("Nenhum registro no período — encerrando sem envio");
      return;
    }

    // 3. Transforma
    const apontamentos = linhas.map(transformarLinha).filter(Boolean);
    const ignorados = linhas.length - apontamentos.length;
    log(`Transformados: ${apontamentos.length} válidos, ${ignorados} ignorados (USO-INTERNO, sem Obra, etc.)`);

    if (apontamentos.length === 0) {
      log("Nenhum apontamento válido — verifique o mapeamento de campos");
      if (linhas.length > 0) log("Campos da 1ª linha: " + Object.keys(linhas[0]).join(", "));
      return;
    }

    // 4. Envia
    const resultado = await enviarPortal(apontamentos, inicio, hoje, duracaoSka);
    log(`Sync OK em ${Date.now() - tInicio}ms — criados: ${resultado.criados}, atualizados: ${resultado.atualizados}`);
    if (resultado.syncId) log(`Sync ID portal: ${resultado.syncId}`);

  } catch (err) {
    log(`ERRO: ${err.message}`);
    if (err.stack) log(err.stack.split("\n")[1] || "");
    process.exit(1);
  }

  log("=== Fim sync MES ===\n");
}

main();
