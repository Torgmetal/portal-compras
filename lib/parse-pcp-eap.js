import * as XLSX from "xlsx";

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function normalize(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** Que mes o nome da aba anuncia ("EAP JUNHO" → 5). -1 quando nao anuncia nenhum. */
function mesDaAba(nome) {
  const n = normalize(nome);
  return MESES_PT.findIndex((m) => n.includes(normalize(m)));
}

/*
 * Procura a aba EAP do mes desejado. Ex: "EAP Maio" pra Maio.
 *
 * ⚠⚠ ABA DE OUTRO MES NAO SERVE, E ANTES SERVIA CALADA (17/09/2026). A regra anterior caia na
 * PRIMEIRA aba "EAP*" quando nao achava a do mes. A planilha de setembro tem uma unica aba EAP,
 * chamada "EAP JUNHO", com o realizado zerado: o sync teria gravado junho todo dia, para sempre,
 * sem ninguem perceber. Aba que anuncia OUTRO mes agora e recusada, com o erro dizendo quais
 * existem — falhar visivel e melhor que acertar por acidente.
 *
 * ⚠ Aba SEM mes no nome (so "EAP") continua servindo para qualquer mes: ha planilha assim, e
 * recusa-la quebraria quem esta certo.
 */
function findEapSheetName(wb, mesIdx) {
  const eaps = wb.SheetNames.filter((n) => normalize(n).startsWith("eap"));
  const alvo = normalize(MESES_PT[mesIdx]);
  const doMes = eaps.find((n) => normalize(n).includes(alvo));
  if (doMes) return { nome: doMes, eaps };
  const generica = eaps.find((n) => mesDaAba(n) < 0);
  return { nome: generica || null, eaps };
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
  for (const [_canonico, aliases] of Object.entries(SETOR_ALIASES)) {
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

// Setores canonicos com nomes "bonitos" que ficam salvos no banco.
export const SETORES_CANONICOS = [
  { canonico: "Corte",      aliasNaPlanilha: "Corte" },
  { canonico: "Montagem",   aliasNaPlanilha: "Mont." },
  { canonico: "Solda",      aliasNaPlanilha: "Sold." },
  { canonico: "Acabamento", aliasNaPlanilha: "Acab." },
  { canonico: "Jato",       aliasNaPlanilha: "Jato" },
  { canonico: "Pintura",    aliasNaPlanilha: "Pint." },
  { canonico: "Expedicao",  aliasNaPlanilha: "Exp." },
];

function extrairSetor({ rows, dataCols, sheetName: _sheetName, setor }) {
  const block = findSetorBlock(rows, setor.aliasNaPlanilha);
  if (!block) return null;
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
      setor: setor.canonico,
      pesoPrevistoKg: prev,
      pesoRealizadoKg: real,
      observacao: `${setor.canonico} | SharePoint`,
    });
  }
  return itens;
}

// Le todos os 7 setores da aba EAP e retorna lista plana de { data, setor, peso... }
export function parseEapProducao(buffer, options = {}) {
  const mesIdx = options.mesIdx ?? new Date().getMonth();

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const { nome: sheetName, eaps } = findEapSheetName(wb, mesIdx);
  if (!sheetName) {
    const achadas = eaps.length ? `A planilha so tem: ${eaps.join(", ")}.` : "A planilha nao tem nenhuma aba EAP.";
    throw new Error(`Aba "EAP ${MESES_PT[mesIdx]}" nao existe. ${achadas} O PCP precisa criar ou renomear a aba do mes.`);
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });

  const headerRow = rows[0] || [];
  const dataCols = extractDateColumns(headerRow);
  if (dataCols.length === 0) {
    throw new Error(`Aba "${sheetName}" sem datas na primeira linha`);
  }

  const itens = [];
  const setoresExtraidos = [];
  const setoresFaltando = [];
  for (const s of SETORES_CANONICOS) {
    const its = extrairSetor({ rows, dataCols, sheetName, setor: s });
    if (its == null) {
      setoresFaltando.push(s.canonico);
      continue;
    }
    setoresExtraidos.push(s.canonico);
    itens.push(...its);
  }

  return {
    itens,
    sheet: sheetName,
    mes: MESES_PT[mesIdx],
    setoresExtraidos,
    setoresFaltando,
    diasComDado: new Set(itens.map((i) => i.data)).size,
    totalPrevisto: itens.reduce((s, x) => s + x.pesoPrevistoKg, 0),
    totalRealizado: itens.reduce((s, x) => s + x.pesoRealizadoKg, 0),
  };
}
