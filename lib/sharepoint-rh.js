import "server-only";
import { getAccessToken } from "./sharepoint";

// ─── Constantes ─────────────────────────────────────────────────────────────────
const FILE_PATH =
  "/SERVIDOR/RH/Workspace/1. Funcionários/1. Controle de Funcionários.xlsx";

const SHEET_BASE = "BASE FUNCIONÁRIOS";
const SHEET_HISTORICO = "HISTÓRICO";

// ─── Helpers ────────────────────────────────────────────────────────────────────
function getDriveId() {
  const v = process.env.SHAREPOINT_DRIVE_ID;
  if (!v) throw new Error("SHAREPOINT_DRIVE_ID não configurado");
  return v;
}

function workbookUrl() {
  return `https://graph.microsoft.com/v1.0/drives/${getDriveId()}/root:${encodeURI(FILE_PATH)}:/workbook`;
}

async function graphWorkbook(path, method = "GET", body = null) {
  const token = await getAccessToken();
  const url = `${workbookUrl()}${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `Graph Workbook ${method}: HTTP ${res.status} — ${txt.slice(0, 300)}`
    );
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Extrair último nº de linha de um endereço de range (ex: "'Sheet'!A1:Q70" → 70) */
function lastRowFromAddress(address) {
  const match = address.match(/:?[A-Z]+(\d+)(?:'?\s*$)/);
  return match ? parseInt(match[1]) : 1;
}

/** dd/mm/yyyy */
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

/** Portal tipoContrato → planilha Tipo Vínculo */
function mapVinculo(tipo) {
  const m = { CLT: "Próprio", PJ: "Terceiro", TEMPORARIO: "Terceiro" };
  return m[tipo] || tipo || "";
}

/** Portal tipoDesligamento → planilha motivo legível */
function mapMotivoDesligamento(tipo) {
  const m = {
    VOLUNTARIO: "Pedido demissão",
    INVOLUNTARIO: "Demitido s/ justa causa",
    JUSTA_CAUSA: "Demitido c/ justa causa",
    TERMINO_CONTRATO: "Fim de contrato",
  };
  return m[tipo] || tipo || "";
}

// ─── Operações de planilha ──────────────────────────────────────────────────────

/** Próxima linha livre após o usedRange */
async function getNextRow(sheetName) {
  const sheet = encodeURIComponent(sheetName);
  const range = await graphWorkbook(
    `/worksheets('${sheet}')/usedRange?$select=address`
  );
  return lastRowFromAddress(range.address) + 1;
}

/** Atualizar (ou inserir) valores em um range específico */
async function patchRange(sheetName, address, values) {
  const sheet = encodeURIComponent(sheetName);
  return graphWorkbook(
    `/worksheets('${sheet}')/range(address='${address}')`,
    "PATCH",
    { values }
  );
}

/**
 * Buscar a linha (1-indexed) de um funcionário na BASE pelo nome.
 * Retorna null se não encontrado.
 */
async function findRowByNome(nome) {
  const sheet = encodeURIComponent(SHEET_BASE);
  const range = await graphWorkbook(
    `/worksheets('${sheet}')/usedRange?$select=values`
  );
  const rows = range.values || [];
  const target = (nome || "").toUpperCase().trim();

  // Coluna B (index 1) = Nome
  for (let i = 1; i < rows.length; i++) {
    const cell = (rows[i][1] || "").toString().toUpperCase().trim();
    if (cell === target) return i + 1; // Excel row (1-indexed, row 1 = header)
  }
  return null;
}

/** Append uma linha ao HISTÓRICO */
async function appendHistorico({
  tipo,
  idFunc,
  nome,
  setor,
  cargoAnterior,
  cargoNovo,
  salarioAnterior,
  salarioNovo,
  motivo,
  observacoes,
}) {
  const nextRow = await getNextRow(SHEET_HISTORICO);
  const row = [
    fmtDate(new Date()), // A — Data Registro
    tipo || "",          // B — Tipo
    idFunc || "",        // C — ID Funcionário
    nome || "",          // D — Nome
    setor || "",         // E — Setor
    cargoAnterior || "", // F — Cargo Anterior
    cargoNovo || "",     // G — Cargo Novo
    salarioAnterior != null ? Number(salarioAnterior) : "", // H
    salarioNovo != null ? Number(salarioNovo) : "",         // I
    motivo || "",        // J — Motivo
    observacoes || "",   // K — Observações
  ];
  await patchRange(SHEET_HISTORICO, `A${nextRow}:K${nextRow}`, [row]);
}

// ─── API pública ────────────────────────────────────────────────────────────────

/**
 * Sincronizar contratação: adicionar na BASE FUNCIONÁRIOS + HISTÓRICO.
 * @param {object} func — funcionário com cargo e setor inclusos (include)
 */
export async function syncContratacao(func) {
  try {
    const nextRow = await getNextRow(SHEET_BASE);

    // Colunas A..Q
    const row = [
      func.matricula || "",                           // A — ID
      (func.nome || "").toUpperCase(),                 // B — Nome
      func.cargo?.nome || "",                          // C — Cargo
      "",                                              // D — Reclassificação
      "",                                              // E — Status Reclassificação
      func.salario != null ? Number(func.salario) : "",// F — Salário Base
      func.setor?.nome || "",                          // G — Setor
      "",                                              // H — Centro de Custo
      func.email || "",                                // I — E-mail
      fmtDate(func.dataAdmissao),                      // J — Data Admissão
      fmtDate(func.dataNascimento),                    // K — Data Nascimento
      "",                                              // L — Tempo de Casa
      "",                                              // M — Convenio KR
      "Ativo",                                         // N — Status
      mapVinculo(func.tipoContrato),                   // O — Tipo Vínculo
      func.cpf || "",                                  // P — CPF
      "",                                              // Q — Carteira de Trabalho
    ];

    await patchRange(SHEET_BASE, `A${nextRow}:Q${nextRow}`, [row]);

    await appendHistorico({
      tipo: "Contratação",
      idFunc: func.matricula || "",
      nome: (func.nome || "").toUpperCase(),
      setor: func.setor?.nome || "",
      cargoNovo: func.cargo?.nome || "",
      salarioNovo: func.salario,
      motivo: "Admissão via Portal",
    });

    return { success: true };
  } catch (e) {
    console.error("[SharePoint RH] Erro sync contratação:", e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Sincronizar ajuste: atualizar campos na BASE FUNCIONÁRIOS + HISTÓRICO.
 * @param {object} func — funcionário atualizado (com include cargo/setor)
 * @param {object} antes — { cargo, setor, salario } valores anteriores
 * @param {object} depois — { cargo, setor, salario } valores novos
 * @param {string} motivo
 */
export async function syncAjuste(func, antes, depois, motivo) {
  try {
    const rowNum = await findRowByNome(func.nome);
    if (!rowNum) {
      console.warn("[SharePoint RH] Funcionário não encontrado na planilha:", func.nome);
      return { success: false, error: "Funcionário não encontrado na planilha" };
    }

    // Atualizar apenas as colunas que mudaram
    // C=Cargo, F=Salário, G=Setor
    if (depois.cargo) {
      await patchRange(SHEET_BASE, `C${rowNum}`, [[depois.cargo]]);
    }
    if (depois.salario != null) {
      await patchRange(SHEET_BASE, `F${rowNum}`, [[Number(depois.salario)]]);
    }
    if (depois.setor) {
      await patchRange(SHEET_BASE, `G${rowNum}`, [[depois.setor]]);
    }

    await appendHistorico({
      tipo: "Ajuste",
      idFunc: func.matricula || "",
      nome: (func.nome || "").toUpperCase(),
      setor: func.setor?.nome || depois.setor || "",
      cargoAnterior: antes.cargo || "",
      cargoNovo: depois.cargo || "",
      salarioAnterior: antes.salario,
      salarioNovo: depois.salario,
      motivo: motivo || "Ajuste via Portal",
    });

    return { success: true };
  } catch (e) {
    console.error("[SharePoint RH] Erro sync ajuste:", e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Sincronizar desligamento: marcar como Desligado na BASE + HISTÓRICO.
 * @param {object} func — funcionário (com include cargo/setor)
 * @param {object} dados — { tipoDesligamento, motivoDesligamento, dataDemissao }
 */
export async function syncDesligamento(func, dados) {
  try {
    const rowNum = await findRowByNome(func.nome);
    if (!rowNum) {
      console.warn("[SharePoint RH] Funcionário não encontrado na planilha:", func.nome);
      return { success: false, error: "Funcionário não encontrado na planilha" };
    }

    // N = Status → "Desligado"
    await patchRange(SHEET_BASE, `N${rowNum}`, [["Desligado"]]);

    await appendHistorico({
      tipo: "Desligamento",
      idFunc: func.matricula || "",
      nome: (func.nome || "").toUpperCase(),
      setor: func.setor?.nome || "",
      cargoAnterior: func.cargo?.nome || "",
      salarioAnterior: func.salario,
      motivo: mapMotivoDesligamento(dados.tipoDesligamento),
      observacoes: dados.motivoDesligamento || "",
    });

    return { success: true };
  } catch (e) {
    console.error("[SharePoint RH] Erro sync desligamento:", e.message);
    return { success: false, error: e.message };
  }
}
