import * as XLSX from "xlsx";

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function normalize(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Procura a aba EAP do mes desejado. Ex: "EAP Maio" pra Maio.
// Se nao achar exatamente, retorna a primeira aba que comeca com "eap".
function findEapSheetName(wb, mesIdx) {
  const alvo = normalize(MESES_PT[mesIdx]);
  for (const name of wb.SheetNames) {
    const n = normalize(name);
    if (n.startsWith("eap") && n.includes(alvo)) return name;
  }
  return wb.SheetNames.find((n) => normalize(n).startsWith("eap")) || null;
}

// Extrai datas da linha 0 (header) — começam na coluna D (idx 3) em diante.
function extractDateColumns(headerRow) {
  const cols = [];
  for (let c = 3; c < headerRow.length; c++) {
    const v = headerRow[c];
    if (v instanceof Date && !isNaN(v)) {
      cols.push({ col: c, date: v.toISOString().slice(0, 10) });
    }
  }
  return cols;
}

// Aliases pra cada setor canonico (planilha as vezes usa abreviacoes).
const SETOR_ALIASES = {
  expedicao: ["expedicao", "exped", "exp"],
  pintura: ["pintura", "pint"],
  jato: ["jato"],
  acabamento: ["acabamento", "acab"],
  solda: ["solda", "sold"],
  montagem: ["montagem", "mont"],
  corte: ["corte"],
};

function setorMatchers(setor) {
  const n = normalize(setor).replace(/\.$/, "");
  // Procura qual chave canonica esse setor representa
  for (const [canonico, aliases] of Object.entries(SETOR_ALIASES)) {
    if (aliases.some((a) => a === n || a.startsWith(n) || n.startsWith(a))) {
      return aliases;
    }
  }
  return [n]; // fallback: usa o input direto
}

// Acha o bloco do setor na aba: linha que tem o nome do setor na coluna A.
// Depois identifica as linhas "Prev." e "Real." dentro das 5 linhas seguintes.
function findSetorBlock(rows, setor) {
  const aliases = setorMatchers(setor);
  let setorRow = -1;
  for (let r = 1; r < rows.length; r++) {
    const v = normalize(rows[r][0]).replace(/\.$/, "");
    if (v && aliases.includes(v)) {
      setorRow = r;
      break;
    }
  }
  if (setorRow === -1) return null;

  let prevRow = -1, realRow = -1;
  for (let r = setorRow; r < Math.min(setorRow + 5, rows.length); r++) {
    const m = normalize(rows[r][2]).replace(/\.$/, "");
    if (m === "prev") prevRow = r;
    if (m === "real") realRow = r;
  }
  if (prevRow === -1 || realRow === -1) return null;
  return { setorRow, prevRow, realRow };
}

// Converte valores cumulativos em deltas diarios.
// Cada coluna D em diante representa o acumulado ATE aquele dia.
function cumulativeToDaily(values) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i].valor) || 0;
    const prev = i === 0 ? 0 : (Number(values[i - 1].valor) || 0);
    out.push({ date: values[i].date, valor: Math.max(0, v - prev) });
  }
  return out;
}

export function parseEapProducao(buffer, options = {}) {
  const setor = options.setor || "Exped.";
  const mesIdx = options.mesIdx ?? new Date().getMonth();

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = findEapSheetName(wb, mesIdx);
  if (!sheetName) {
    throw new Error(`Aba EAP nao encontrada (procurando "EAP ${MESES_PT[mesIdx]}")`);
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });

  const headerRow = rows[0] || [];
  const dataCols = extractDateColumns(headerRow);
  if (dataCols.length === 0) {
    throw new Error(`Aba "${sheetName}" sem datas na primeira linha (esperado em colunas D em diante)`);
  }

  const block = findSetorBlock(rows, setor);
  if (!block) {
    throw new Error(`Setor "${setor}" nao encontrado ou sem linhas Prev./Real. na aba "${sheetName}"`);
  }

  const acumPrev = dataCols.map(({ col, date }) => ({ date, valor: rows[block.prevRow][col] }));
  const acumReal = dataCols.map(({ col, date }) => ({ date, valor: rows[block.realRow][col] }));

  const diariosPrev = cumulativeToDaily(acumPrev);
  const diariosReal = cumulativeToDaily(acumReal);

  const itens = [];
  for (let i = 0; i < dataCols.length; i++) {
    const prev = diariosPrev[i].valor;
    const real = diariosReal[i].valor;
    if (prev === 0 && real === 0) continue;
    itens.push({
      data: dataCols[i].date,
      pesoPrevistoKg: prev,
      pesoRealizadoKg: real,
      observacao: `${setor} | SharePoint`,
    });
  }

  return {
    itens,
    setor,
    sheet: sheetName,
    mes: MESES_PT[mesIdx],
    diasComDado: itens.length,
    totalPrevisto: itens.reduce((s, x) => s + x.pesoPrevistoKg, 0),
    totalRealizado: itens.reduce((s, x) => s + x.pesoRealizadoKg, 0),
  };
}
