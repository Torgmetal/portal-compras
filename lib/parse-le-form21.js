import * as XLSX from "xlsx";

// Parser da "Lista Geral do Projeto" (FORM 21) — formato padrao usado pela Torg.
// Estrutura:
//   L0-3: cabecalho (CLIENTE, OBRA, OP)
//   L4:   colunas (ITEM | MARCA | QTD | DESCRICAO | REV | AREA | PESO UNIT | PESO TOTAL | DATA...)
//   L5:   subcabecalho
//   L6+:  dados das pecas

function normalize(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

// Detecta a linha do cabecalho de colunas (procura por "MARCA" e "QTD")
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const r = rows[i] || [];
    const hasMarca = r.some((c) => normalize(c).includes("marca"));
    const hasQtd = r.some((c) => normalize(c).includes("qtd") || normalize(c).includes("quant"));
    if (hasMarca && hasQtd) return i;
  }
  return -1;
}

// Acha o indice da coluna procurando o cabecalho
function findColIdx(headerRow, candidates) {
  for (let c = 0; c < headerRow.length; c++) {
    const n = normalize(headerRow[c]);
    for (const cand of candidates) {
      if (n.includes(cand)) return c;
    }
  }
  return -1;
}

// Normaliza numero de OP extraido do arquivo — remove prefixo Tekla e sufixo de sublista.
// Ex: "T82A" → "82", "T82B" → "82", "T83" → "83", "T-105C" → "105", "82" → "82"
function normalizarOpNumero(raw) {
  if (!raw) return raw;
  const s = String(raw).trim().replace(/\s+/g, "");
  const m = s.match(/^[Tt]?-?(\d+)[A-Za-z]*$/);
  return m ? m[1] : s;
}

// Extrai OP do cabecalho (geralmente nas primeiras linhas)
function extrairOpNumero(rows) {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length - 1; c++) {
      const label = normalize(r[c]);
      if (label === "op" && r[c + 1]) {
        return normalizarOpNumero(r[c + 1]);
      }
    }
  }
  return null;
}

export function parseFormularioLE(buffer, { opNumeroForcado = null, sheetName = null } = {}) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const useSheet = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const sheet = wb.Sheets[useSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });

  const opNumero = (opNumeroForcado || extrairOpNumero(rows) || "").trim();
  if (!opNumero) {
    throw new Error("Não foi possível identificar a OP no cabeçalho (procurando célula 'OP:'). Especifique manualmente.");
  }

  const headerRowIdx = findHeaderRow(rows);
  if (headerRowIdx === -1) {
    throw new Error("Cabeçalho não encontrado (esperado colunas MARCA e QTD/QUANTIDADE).");
  }

  const header = rows[headerRowIdx];
  const cIdx = {
    item:       findColIdx(header, ["item"]),
    marca:      findColIdx(header, ["marca"]),
    qtd:        findColIdx(header, ["qtd", "quant"]),
    descricao:  findColIdx(header, ["descricao", "desc"]),
    rev:        findColIdx(header, ["rev"]),
    pesoUnit:   findColIdx(header, ["pesounit", "pesounitario"]),
    pesoTotal:  findColIdx(header, ["pesototal"]),
  };

  // Validacao basica
  if (cIdx.marca === -1) throw new Error("Coluna MARCA não encontrada.");
  if (cIdx.qtd === -1) throw new Error("Coluna QTD não encontrada.");
  if (cIdx.pesoUnit === -1 && cIdx.pesoTotal === -1) throw new Error("Coluna PESO UNIT ou PESO TOTAL não encontrada.");

  // Linha logo apos o cabecalho pode ser subcabecalho — pula se nao tem numero em ITEM
  let dataStart = headerRowIdx + 1;
  // Pula linhas que sao subcabecalho (sem item numerico ou sem marca)
  while (dataStart < rows.length) {
    const r = rows[dataStart];
    const marca = r?.[cIdx.marca];
    if (marca && !["marca", null].includes(normalize(marca))) break;
    dataStart++;
  }

  const pecas = [];
  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const marca = r[cIdx.marca];
    if (!marca || String(marca).trim() === "") continue;

    const qtdRaw = r[cIdx.qtd];
    const qtd = Number(String(qtdRaw ?? "").replace(",", ".")) || 0;
    if (qtd === 0) continue; // Pula linhas de totais/sem qte

    const pesoUnit = cIdx.pesoUnit >= 0 ? Number(String(r[cIdx.pesoUnit] ?? "").replace(",", ".")) || 0 : 0;
    const pesoTotal = cIdx.pesoTotal >= 0 ? Number(String(r[cIdx.pesoTotal] ?? "").replace(",", ".")) || 0 : pesoUnit * qtd;

    const marcaStr = String(marca).trim();
    // Fluxo especial = peca que pula montagem/solda/acab (vai corte->jato->pintura).
    // Convencao do usuario nao esta clara, deixa false default e ele marca manual.
    const fluxoEspecial = false;

    pecas.push({
      item: cIdx.item >= 0 ? Number(r[cIdx.item]) || null : null,
      marca: marcaStr,
      qte: qtd,
      descricao: cIdx.descricao >= 0 ? String(r[cIdx.descricao] ?? "").trim() || null : null,
      pesoUnitKg: pesoUnit,
      pesoTotalKg: pesoTotal,
      fluxoEspecial,
    });
  }

  return {
    opNumero,
    sheet: useSheet,
    pecas,
    pesoTotal: pecas.reduce((s, p) => s + p.pesoTotalKg, 0),
    qteTotal: pecas.reduce((s, p) => s + p.qte, 0),
  };
}
