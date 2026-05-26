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

  // Endpoint correto confirmado: POST /v1/auth/login
  // (POST /v1/users/login retorna "validated: false" mesmo com credenciais corretas)
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

  const data = await resp.json();
  // Estrutura da resposta: { message: "Authentication success", data: [{ token, expiresIn, licenseToken }] }
  const token = data.data?.[0]?.token
    || data.token || data.accessToken || data.jwt
    || (typeof data === "string" ? data : null);

  if (!token) throw new Error("Token não encontrado na resposta: " + JSON.stringify(data).substring(0, 200));
  log(`Login OK — token ${token.length} chars`);
  return token;
}

// ─── Busca dataset 242 — SKA ignora page/pageSize, retorna tudo em 1 chamada ──
async function skaFetchDataset242(token, startDate, endDate) {
  const startStr = fmtISO(startDate);
  const endStr   = fmtISO(endDate);
  log(`Buscando dataset 242: ${startStr} → ${endStr}`);

  // SKA ignora os parâmetros page/pageSize e devolve o dataset completo numa única resposta
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
    timeout: 120000,
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

  log(`Total SKA: ${rows.length} registros`);
  if (rows.length > 0) log(`Campos do dataset: ${Object.keys(rows[0]).join(", ")}`);

  return rows;
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
    hoje.setHours(23); hoje.setMinutes(59); hoje.setSeconds(59);

    const fimGeral = new Date(hoje);
    const inicioGeral = new Date(hoje);
    inicioGeral.setDate(inicioGeral.getDate() - SYNC_DIAS_ATRAS);
    inicioGeral.setHours(0); inicioGeral.setMinutes(0); inicioGeral.setSeconds(0);

    log(`Período total: ${inicioGeral.toISOString().split("T")[0]} → ${fimGeral.toISOString().split("T")[0]} (${SYNC_DIAS_ATRAS} dias)`);

    // 1. Login
    const token = await skaLogin();

    // 2. Busca todo o período de uma vez (SKA retorna ~30k/página, break na página vazia)
    const tSka = Date.now();
    const linhas = await skaFetchDataset242(token, inicioGeral, fimGeral);
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
    const resultado = await enviarPortal(apontamentos, inicioGeral, fimGeral, duracaoSka);
    log(`Sync completo em ${((Date.now() - tInicio)/1000).toFixed(1)}s — total: ${linhas.length} linhas SKA | criados: ${resultado.criados} | atualizados: ${resultado.atualizados}`);

  } catch (err) {
    log(`ERRO: ${err.message}`);
    if (err.stack) log(err.stack.split("\n")[1] || "");
    process.exit(1);
  }

  log("=== Fim sync MES ===\n");
}

main();
