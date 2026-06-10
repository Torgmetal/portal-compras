import "server-only";
import { getAccessToken, uploadFileToFolder } from "./sharepoint";
import { assertBlobUrlSegura } from "./blob-url";
import ExcelJS from "exceljs";

// Pasta de backup ISO dos documentos de RH no SharePoint (configurável por env).
const DOCS_FOLDER = process.env.SHAREPOINT_RH_DOCS_FOLDER || "/RH/Workspace/Documentos";

/**
 * Faz a cópia de backup (controle ISO) de um documento de RH no SharePoint.
 * Baixa o arquivo do Blob e sobe para a pasta de documentos, com nome
 * prefixado pelo funcionário/empresa e tipo (fica agrupado por funcionário ao
 * ordenar por nome). Retorna o webUrl da cópia. LANÇA em erro (não é silencioso
 * — backup ISO que falha precisa ser registrado pelo chamador).
 */
export async function backupDocumentoRh({ arquivoUrl, arquivoNome, arquivoTipo, funcionarioNome, tipo }) {
  assertBlobUrlSegura(arquivoUrl);
  const res = await fetch(arquivoUrl);
  if (!res.ok) throw new Error(`Falha ao baixar do Blob: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const quem = (funcionarioNome || "EMPRESA").toUpperCase().trim();
  const fileName = `${quem}${tipo ? ` - ${tipo}` : ""} - ${arquivoNome || "documento"}`.slice(0, 200);
  const { webUrl } = await uploadFileToFolder({
    folderPath: DOCS_FOLDER,
    fileName,
    buffer,
    contentType: arquivoTipo || "application/octet-stream",
  });
  return webUrl;
}

const FILE_PATH =
  "/RH/Workspace/1. Funcionários/1. Controle de Funcionários (USO DO PORTAL).xlsx";

const SHEET_BASE = "BASE FUNCIONÁRIOS";
const SHEET_HISTORICO = "HISTÓRICO";
const HISTORICO_HEADER_ROW = 3;

function getDriveId() {
  const v = process.env.SHAREPOINT_DRIVE_ID;
  if (!v) throw new Error("SHAREPOINT_DRIVE_ID não configurado");
  return v;
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

function mapVinculo(tipo) {
  const m = { CLT: "Próprio", PJ: "Terceiro", TEMPORARIO: "Terceiro" };
  return m[tipo] || tipo || "";
}

function mapMotivoDesligamento(tipo) {
  const m = {
    VOLUNTARIO: "Pedido demissão",
    INVOLUNTARIO: "Demitido s/ justa causa",
    JUSTA_CAUSA: "Demitido c/ justa causa",
    TERMINO_CONTRATO: "Fim de contrato",
  };
  return m[tipo] || tipo || "";
}

async function withWorkbook(modifyFn) {
  const token = await getAccessToken();
  const driveId = getDriveId();
  const encoded = encodeURI(FILE_PATH);
  const base = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:${encoded}:`;

  const dlRes = await fetch(`${base}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "follow",
  });
  if (!dlRes.ok) {
    throw new Error(`SharePoint download: HTTP ${dlRes.status}`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await dlRes.arrayBuffer()));

  await modifyFn(wb);

  const buf = await wb.xlsx.writeBuffer();

  const upRes = await fetch(`${base}/content`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    body: Buffer.from(buf),
  });
  if (!upRes.ok) {
    throw new Error(`SharePoint upload: HTTP ${upRes.status}`);
  }
}

function findRowByNome(sheet, nome) {
  const target = (nome || "").toUpperCase().trim();
  for (let r = 2; r <= sheet.rowCount; r++) {
    const cell = (sheet.getRow(r).getCell(2).value || "").toString().toUpperCase().trim();
    if (cell === target) return r;
  }
  return null;
}

function appendHistorico(wb, { tipo, idFunc, nome, setor, cargoAnterior, cargoNovo, salarioAnterior, salarioNovo, motivo, observacoes }) {
  const sheet = wb.getWorksheet(SHEET_HISTORICO);
  if (!sheet) return;

  let nextRow = HISTORICO_HEADER_ROW + 1;
  for (let r = HISTORICO_HEADER_ROW + 1; r <= sheet.rowCount; r++) {
    const val = sheet.getRow(r).getCell(1).value;
    if (val && String(val).trim()) nextRow = r + 1;
  }

  const row = sheet.getRow(nextRow);
  row.getCell(1).value = fmtDate(new Date());
  row.getCell(2).value = tipo || "";
  row.getCell(3).value = idFunc || "";
  row.getCell(4).value = nome || "";
  row.getCell(5).value = setor || "";
  row.getCell(6).value = cargoAnterior || "";
  row.getCell(7).value = cargoNovo || "";
  row.getCell(8).value = salarioAnterior != null ? Number(salarioAnterior) : "";
  row.getCell(9).value = salarioNovo != null ? Number(salarioNovo) : "";
  row.getCell(10).value = motivo || "";
  row.getCell(11).value = observacoes || "";
  row.commit();
}

export async function syncContratacao(func) {
  try {
    await withWorkbook((wb) => {
      const sheet = wb.getWorksheet(SHEET_BASE);
      if (!sheet) throw new Error("Sheet BASE FUNCIONÁRIOS não encontrada");

      let nextRow = 2;
      for (let r = 2; r <= sheet.rowCount; r++) {
        const val = sheet.getRow(r).getCell(2).value;
        if (val && String(val).trim()) nextRow = r + 1;
      }

      const row = sheet.getRow(nextRow);
      row.getCell(1).value = func.matricula || "";
      row.getCell(2).value = (func.nome || "").toUpperCase();
      row.getCell(3).value = func.cargo?.nome || "";
      row.getCell(4).value = "";
      row.getCell(5).value = "";
      row.getCell(6).value = func.salario != null ? Number(func.salario) : "";
      row.getCell(7).value = func.setor?.nome || "";
      row.getCell(8).value = "";
      row.getCell(9).value = func.email || "";
      row.getCell(10).value = fmtDate(func.dataAdmissao);
      row.getCell(11).value = fmtDate(func.dataNascimento);
      row.getCell(12).value = "";
      row.getCell(13).value = "";
      row.getCell(14).value = "Ativo";
      row.getCell(15).value = mapVinculo(func.tipoContrato);
      row.getCell(16).value = func.cpf || "";
      row.getCell(17).value = "";
      row.commit();

      appendHistorico(wb, {
        tipo: "Contratação",
        idFunc: func.matricula || "",
        nome: (func.nome || "").toUpperCase(),
        setor: func.setor?.nome || "",
        cargoNovo: func.cargo?.nome || "",
        salarioNovo: func.salario,
        motivo: "Admissão via Portal",
      });
    });
    return { success: true };
  } catch (e) {
    console.error("[SharePoint RH] Erro sync contratação:", e.message);
    return { success: false, error: e.message };
  }
}

export async function syncAjuste(func, antes, depois, motivo) {
  try {
    await withWorkbook((wb) => {
      const sheet = wb.getWorksheet(SHEET_BASE);
      if (!sheet) throw new Error("Sheet BASE FUNCIONÁRIOS não encontrada");

      const rowNum = findRowByNome(sheet, func.nome);
      if (!rowNum) {
        console.warn("[SharePoint RH] Funcionário não encontrado na planilha:", func.nome);
        return;
      }

      const row = sheet.getRow(rowNum);
      if (depois.cargo) row.getCell(3).value = depois.cargo;
      if (depois.salario != null) row.getCell(6).value = Number(depois.salario);
      if (depois.setor) row.getCell(7).value = depois.setor;
      row.commit();

      appendHistorico(wb, {
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
    });
    return { success: true };
  } catch (e) {
    console.error("[SharePoint RH] Erro sync ajuste:", e.message);
    return { success: false, error: e.message };
  }
}

export async function syncDesligamento(func, dados) {
  try {
    await withWorkbook((wb) => {
      const sheet = wb.getWorksheet(SHEET_BASE);
      if (!sheet) throw new Error("Sheet BASE FUNCIONÁRIOS não encontrada");

      const rowNum = findRowByNome(sheet, func.nome);
      if (!rowNum) {
        console.warn("[SharePoint RH] Funcionário não encontrado na planilha:", func.nome);
        return;
      }

      sheet.getRow(rowNum).getCell(14).value = "Desligado";
      sheet.getRow(rowNum).commit();

      appendHistorico(wb, {
        tipo: "Desligamento",
        idFunc: func.matricula || "",
        nome: (func.nome || "").toUpperCase(),
        setor: func.setor?.nome || "",
        cargoAnterior: func.cargo?.nome || "",
        salarioAnterior: func.salario,
        motivo: mapMotivoDesligamento(dados.tipoDesligamento),
        observacoes: dados.motivoDesligamento || "",
      });
    });
    return { success: true };
  } catch (e) {
    console.error("[SharePoint RH] Erro sync desligamento:", e.message);
    return { success: false, error: e.message };
  }
}
