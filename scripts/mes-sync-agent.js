/**
 * mes-sync-agent.js
 * Agente local de sincronização MES → Portal Torg
 *
 * Roda na máquina do servidor local (Windows) via Task Scheduler.
 * Autentica no SKA Syneco Reports API, busca os apontamentos do dia
 * (ou período configurado) e envia pro portal via HTTPS.
 *
 * Configuração: criar um arquivo .env na mesma pasta com:
 *   SKA_API_URL=http://192.168.0.190:1000
 *   SKA_USER=usuario
 *   SKA_PASS=senha
 *   SKA_DATASET_ID=126
 *   PORTAL_API_URL=https://workspace.torg.com.br
 *   PORTAL_API_KEY=<chave gerada pelo portal>
 *   SYNC_DIAS_ATRAS=1   (opcional, default: 1 — busca ontem + hoje)
 *   LOG_FILE=mes-sync.log (opcional)
 *
 * Instalação:
 *   1. Copiar este arquivo para C:\MesSync\ (ou pasta de preferência)
 *   2. Criar .env na mesma pasta com as variáveis acima
 *   3. npm init -y && npm install node-fetch@2 dotenv
 *   4. Criar tarefa no Task Scheduler:
 *      - Programa: node
 *      - Argumentos: "C:\MesSync\mes-sync-agent.js"
 *      - Gatilho: a cada 1 hora
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const fetch = require("node-fetch");
const fs    = require("fs");

// ─── Configuração ─────────────────────────────────────────────
const SKA_API_URL   = process.env.SKA_API_URL   || "http://192.168.0.190:1000";
const SKA_USER      = process.env.SKA_USER;
const SKA_PASS      = process.env.SKA_PASS;
const SKA_DATASET_ID = process.env.SKA_DATASET_ID || "126";
const PORTAL_API_URL = process.env.PORTAL_API_URL || "https://workspace.torg.com.br";
const PORTAL_API_KEY = process.env.PORTAL_API_KEY;
const SYNC_DIAS_ATRAS = parseInt(process.env.SYNC_DIAS_ATRAS || "1", 10);
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, "mes-sync.log");

// ─── Utilitários ──────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString();
  const linha = `[${ts}] ${msg}`;
  console.log(linha);
  try {
    fs.appendFileSync(LOG_FILE, linha + "\n");
  } catch (_) {}
}

function fmtDate(d) {
  // Formato SKA: DD/MM/YYYY
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function isoDate(d) {
  // Para enviar ao portal: YYYY-MM-DD
  return d.toISOString().split("T")[0];
}

// ─── Autenticação SKA ─────────────────────────────────────────
async function skaLogin() {
  if (!SKA_USER || !SKA_PASS) {
    throw new Error("SKA_USER e SKA_PASS devem estar configurados no .env");
  }
  const resp = await fetch(`${SKA_API_URL}/v1/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: SKA_USER, password: SKA_PASS }),
    timeout: 15000,
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`SKA login falhou (${resp.status}): ${txt.substring(0, 200)}`);
  }
  const data = await resp.json();
  // O token pode estar em data.token, data.accessToken, data.jwt, ou ser a própria resposta
  const token = data.token || data.accessToken || data.jwt || data.Token || (typeof data === "string" ? data : null);
  if (!token) {
    throw new Error("Token não encontrado na resposta de login: " + JSON.stringify(data).substring(0, 200));
  }
  log(`Login SKA OK — token ${token.length} chars`);
  return token;
}

// ─── Busca de dados SKA (dataset 126) ────────────────────────
async function skaFetchDataset(token, startDate, endDate) {
  const allRows = [];
  let page = 1;
  const pageSize = 500;

  log(`Buscando dataset ${SKA_DATASET_ID}: ${fmtDate(startDate)} → ${fmtDate(endDate)}`);

  while (true) {
    // Constrói query string manualmente para evitar encoding do % pelo URLSearchParams
    const qs = [
      `StartDate=${fmtDate(startDate)}`,
      `EndDate=${fmtDate(endDate)}`,
      `ShiftNum=-2`,    // todos os turnos
      `Resource=-2`,    // todas as máquinas
      `CostCenter=-2`,  // todos os setores
      `PartCode=%`,     // todas as peças (wildcard SQL)
      `Operation=%`,    // todas as operações
      `OrderNum=%`,     // todas as OPs
      `Obra=%`,         // todas as obras
      `page=${page}`,
      `pageSize=${pageSize}`,
    ].join("&");

    const url = `${SKA_API_URL}/v1/dataset/${SKA_DATASET_ID}/run?${qs}`;
    log(`  GET página ${page}...`);

    const resp = await fetch(url, {
      method: "GET",
      headers: { token },
      timeout: 30000,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`SKA dataset erro (${resp.status}): ${txt.substring(0, 300)}`);
    }

    const data = await resp.json();

    // A API pode retornar { data: [...], total: N } ou diretamente um array
    const rows = Array.isArray(data) ? data : (data.data || data.rows || data.result || []);

    if (!Array.isArray(rows)) {
      throw new Error("Formato de resposta inesperado: " + JSON.stringify(data).substring(0, 200));
    }

    allRows.push(...rows);
    log(`  Página ${page}: ${rows.length} registros`);

    // Para quando retornar menos que pageSize (última página)
    if (rows.length < pageSize) break;
    page++;

    // Segurança: não mais de 20 páginas (10.000 registros)
    if (page > 20) {
      log("  AVISO: limite de 20 páginas atingido");
      break;
    }
  }

  log(`Total de registros SKA: ${allRows.length}`);
  return allRows;
}

// ─── Transforma linha SKA → apontamento portal ───────────────
function transformarLinha(row) {
  // Os nomes dos campos dependem do SQL do dataset 126.
  // Baseado na análise do dataset, os campos esperados são:
  // OrderNum, Obra, CostCenter/Setor, Resource/Maquina, Operation, PartCode,
  // ProduzidoKg/PesoKg/WeightKg, ProduzidoUn/QtdProduzida/ProducedQty,
  // StartDate/Data, ShiftNum/Turno
  //
  // Como os nomes exatos dependem do SQL configurado no SKA,
  // tentamos várias variações de nome de campo.

  function campo(...nomes) {
    for (const n of nomes) {
      if (row[n] !== undefined && row[n] !== null) return row[n];
      // case-insensitive search
      const key = Object.keys(row).find((k) => k.toLowerCase() === n.toLowerCase());
      if (key && row[key] !== undefined) return row[key];
    }
    return null;
  }

  const dataRaw = campo("StartDate", "Data", "Date", "DataApontamento", "Dt_Apontamento");
  const opNumero = String(campo("OrderNum", "OpNumero", "OP", "NrOP", "Order") || "").trim();
  if (!opNumero || !dataRaw) return null;

  // Normaliza data para YYYY-MM-DD
  let dataISO;
  if (typeof dataRaw === "string") {
    // Pode ser DD/MM/YYYY ou YYYY-MM-DD ou timestamp ISO
    if (/^\d{2}\/\d{2}\/\d{4}/.test(dataRaw)) {
      const [dd, mm, yyyy] = dataRaw.split("/");
      dataISO = `${yyyy}-${mm}-${dd}`;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(dataRaw)) {
      dataISO = dataRaw.substring(0, 10);
    } else {
      dataISO = new Date(dataRaw).toISOString().split("T")[0];
    }
  } else if (dataRaw instanceof Date || typeof dataRaw === "number") {
    dataISO = new Date(dataRaw).toISOString().split("T")[0];
  } else {
    return null;
  }

  return {
    dataApontamento: dataISO,
    turno:      Number(campo("ShiftNum", "Turno", "Shift") || -2),
    opNumero,
    obra:       String(campo("Obra", "NomeObra", "WorkName") || "").trim() || null,
    setor:      String(campo("CostCenter", "Setor", "Sector", "Centro") || "").trim() || null,
    maquina:    String(campo("Resource", "Maquina", "Machine", "Recurso") || "").trim() || null,
    operacao:   String(campo("Operation", "Operacao", "Op") || "").trim() || null,
    codigoPeca: String(campo("PartCode", "CodigoPeca", "Part", "Codigo") || "").trim() || null,
    produzidoKg: Number(campo("ProduzidoKg", "PesoKg", "WeightKg", "PesoTotal", "Kg", "Peso") || 0),
    produzidoUn: Number(campo("ProduzidoUn", "QtdProduzida", "ProducedQty", "Qtd", "Qty", "Quantidade") || 0),
  };
}

// ─── Envia para o portal ──────────────────────────────────────
async function enviarPortal(apontamentos, dataInicio, dataFim, duracaoSka) {
  if (!PORTAL_API_KEY) {
    throw new Error("PORTAL_API_KEY não configurada no .env");
  }
  log(`Enviando ${apontamentos.length} apontamentos para o portal...`);

  const resp = await fetch(`${PORTAL_API_URL}/api/mes/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PORTAL_API_KEY}`,
    },
    body: JSON.stringify({
      apontamentos,
      dataInicio: isoDate(dataInicio),
      dataFim:    isoDate(dataFim),
      duracaoMs:  duracaoSka,
    }),
    timeout: 60000,
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Portal retornou ${resp.status}: ${txt.substring(0, 300)}`);
  }

  return await resp.json();
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  log("=== Início do sync MES ===");
  const tInicio = Date.now();

  try {
    // Período: D-N até hoje
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - SYNC_DIAS_ATRAS);

    // 1. Login SKA
    const token = await skaLogin();

    // 2. Busca dados
    const tSka = Date.now();
    const linhas = await skaFetchDataset(token, inicio, hoje);
    const duracaoSka = Date.now() - tSka;

    if (linhas.length === 0) {
      log("Nenhum registro encontrado no período — sync encerrado sem envio");
      return;
    }

    // 3. Transforma
    const apontamentos = linhas.map(transformarLinha).filter(Boolean);
    log(`Transformados: ${apontamentos.length} de ${linhas.length} linhas válidas`);

    if (apontamentos.length === 0) {
      log("Nenhum apontamento válido — verifique o mapeamento de campos do dataset");
      // Log dos campos da primeira linha para diagnóstico
      log("Campos da primeira linha: " + Object.keys(linhas[0]).join(", "));
      return;
    }

    // 4. Envia ao portal
    const resultado = await enviarPortal(apontamentos, inicio, hoje, duracaoSka);
    const total = Date.now() - tInicio;
    log(`Sync concluído em ${total}ms — criados: ${resultado.criados}, atualizados: ${resultado.atualizados}`);
    log(`ID do sync no portal: ${resultado.syncId}`);

  } catch (err) {
    log(`ERRO: ${err.message}`);
    process.exit(1);
  }

  log("=== Fim do sync MES ===");
}

main();
