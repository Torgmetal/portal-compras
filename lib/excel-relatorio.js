/**
 * Utilitario para gerar relatorios Excel profissionais com branding Torg Metal.
 * Segue padrao ISO 9001 de controle de documentos.
 * Usa ExcelJS para suporte a imagens e formatacao avancada.
 * Browser-side only — importar apenas em componentes "use client".
 */

// Cores da marca
const TORG_BLUE = "006EAB";
const TORG_DARK = "002945";
const TORG_GRAY = "576D7E";
const TORG_ORANGE = "F4801F";
const HEADER_BG = "00406B";
const LIGHT_GREEN = "E8F8E8";
const LIGHT_ORANGE = "FFF3E8";
const LIGHT_BLUE = "EBF5FB";
const TOTAL_BG = "F0F4F8";
const BORDER_COLOR = "B0BEC5";
const HEADER_BORDER = "004D80";

// Mapeamento de codigos de documento por modulo
const DOC_CODES = {
  "Controle de Pecas": "REL-PRD-001",
  "Mapa da Producao": "REL-PRD-002",
  "Programacao": "REL-PRD-003",
  "Inventario": "REL-ALM-001",
};

/**
 * Carrega o logo da Torg como ArrayBuffer (para ExcelJS addImage).
 * @returns {Promise<ArrayBuffer>}
 */
async function carregarLogo() {
  try {
    const res = await fetch("/torg-logo-excel.png");
    if (!res.ok) throw new Error("Logo nao encontrado");
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Aplica borda fina em uma celula.
 */
function bordaFina(cell, cor = BORDER_COLOR) {
  cell.border = {
    top: { style: "thin", color: { argb: cor } },
    bottom: { style: "thin", color: { argb: cor } },
    left: { style: "thin", color: { argb: cor } },
    right: { style: "thin", color: { argb: cor } },
  };
}

/**
 * Aplica borda media (para header/footer ISO).
 */
function bordaMedia(cell, cor = TORG_BLUE) {
  cell.border = {
    top: { style: "medium", color: { argb: cor } },
    bottom: { style: "medium", color: { argb: cor } },
    left: { style: "medium", color: { argb: cor } },
    right: { style: "medium", color: { argb: cor } },
  };
}

/**
 * Cria um workbook ExcelJS com cabecalho padrao ISO 9001 Torg Metal.
 *
 * Layout do cabecalho:
 * +-----------+----------------------------+------------------+
 * |           | TORG METAL                 | Codigo: REL-XXX  |
 * |   LOGO    | Estruturas Metalicas       | Revisao: 00      |
 * |           | [Titulo do Relatorio]      | Emissao: dd/mm   |
 * +-----------+----------------------------+------------------+
 * | KPIs (quando houver)                                      |
 * +-----------------------------------------------------------+
 *
 * @param {Object} opts
 * @param {string} opts.titulo - Titulo do relatorio
 * @param {string} [opts.subtitulo] - Subtitulo (filtros ativos, etc.)
 * @param {string[]} [opts.kpis] - Linhas de KPI
 * @param {number} [opts.totalColunas=10] - Quantas colunas o header abrange
 * @param {string} [opts.nomePlanilha] - Nome da aba
 * @param {string} [opts.codigoDoc] - Codigo do documento (auto-detecta se nao informado)
 * @param {string} [opts.revisao="00"] - Numero da revisao
 * @param {string} [opts.elaboradoPor] - Nome de quem elaborou
 * @returns {Promise<{workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, linhaInicio: number}>}
 */
export async function criarRelatorioTorg(opts) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Torg Metal — Workspace";
  wb.created = new Date();

  const ws = wb.addWorksheet(opts.nomePlanilha || "Relatorio", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.8, bottom: 0.8, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter:
        "&L&8&\"Arial\"Torg Metal — Estruturas Metalicas" +
        "&C&8&\"Arial\"Documento controlado — Proibida reproducao sem autorizacao" +
        "&R&8&\"Arial\"Pagina &P de &N",
    },
  });

  const totalCols = opts.totalColunas || 10;

  // Detectar codigo do documento
  const codigoDoc = opts.codigoDoc || detectarCodigoDoc(opts.titulo) || "REL-GER-001";
  const revisao = opts.revisao || "00";

  const agora = new Date();
  const dataEmissao = agora.toLocaleDateString("pt-BR");
  const horaEmissao = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // === CABECALHO ISO 9001 ===
  // Linha 1-3: Logo (col 1-2) | Titulo (col 3 ao penultimo) | Controle (ultimas 2 cols)

  const colControleInicio = Math.max(totalCols - 2, 4);

  // Merge areas do cabecalho
  // Logo: colunas 1-2, linhas 1-3
  ws.mergeCells(1, 1, 3, 2);
  // Titulo: colunas 3 ate colControle-1, linhas 1-3
  if (colControleInicio > 3) {
    ws.mergeCells(1, 3, 1, colControleInicio - 1);
    ws.mergeCells(2, 3, 2, colControleInicio - 1);
    ws.mergeCells(3, 3, 3, colControleInicio - 1);
  }
  // Controle: ultimas colunas, linhas 1-3
  ws.mergeCells(1, colControleInicio, 1, totalCols);
  ws.mergeCells(2, colControleInicio, 2, totalCols);
  ws.mergeCells(3, colControleInicio, 3, totalCols);

  // Altura das linhas do header
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;

  // Logo
  const logoData = await carregarLogo();
  if (logoData) {
    const imgId = wb.addImage({ buffer: logoData, extension: "png" });
    ws.addImage(imgId, {
      tl: { col: 0.25, row: 0.35 },
      ext: { width: 120, height: 42 },
    });
  }

  // Fundo branco no logo area
  const logoCell = ws.getCell(1, 1);
  logoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };
  logoCell.alignment = { vertical: "middle", horizontal: "center" };

  // Linha 1: TORG METAL (titulo da empresa)
  const cellEmpresa = ws.getCell(1, 3);
  cellEmpresa.value = "TORG METAL";
  cellEmpresa.font = { name: "Arial", size: 14, bold: true, color: { argb: TORG_BLUE } };
  cellEmpresa.alignment = { vertical: "middle", horizontal: "left" };
  cellEmpresa.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };

  // Linha 2: Estruturas Metalicas
  const cellSegmento = ws.getCell(2, 3);
  cellSegmento.value = "Estruturas Metalicas";
  cellSegmento.font = { name: "Arial", size: 9, color: { argb: TORG_GRAY } };
  cellSegmento.alignment = { vertical: "middle", horizontal: "left" };
  cellSegmento.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };

  // Linha 3: Titulo do relatorio
  const cellTitulo = ws.getCell(3, 3);
  cellTitulo.value = opts.titulo || "Relatorio";
  cellTitulo.font = { name: "Arial", size: 11, bold: true, color: { argb: TORG_DARK } };
  cellTitulo.alignment = { vertical: "middle", horizontal: "left" };
  cellTitulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };

  // Controle de documento (lado direito)
  const ctrlLabels = [
    { label: "Codigo", valor: codigoDoc },
    { label: "Emissao", valor: `${dataEmissao} ${horaEmissao}` },
  ];

  for (let i = 0; i < ctrlLabels.length; i++) {
    const cell = ws.getCell(i + 1, colControleInicio);
    cell.value = `${ctrlLabels[i].label}: ${ctrlLabels[i].valor}`;
    cell.font = { name: "Arial", size: 8, bold: i === 0, color: { argb: TORG_DARK } };
    cell.alignment = { vertical: "middle", horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F5F7FA" } };
  }
  // Linha 3 do controle: fundo uniforme
  const cellCtrl3 = ws.getCell(3, colControleInicio);
  cellCtrl3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F5F7FA" } };

  // Bordas do cabecalho ISO
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= totalCols; c++) {
      bordaMedia(ws.getCell(r, c));
    }
  }

  // === SUBTITULO / FILTROS (linha 4) ===
  let row = 4;
  if (opts.subtitulo) {
    ws.mergeCells(row, 1, row, totalCols);
    const cellSub = ws.getCell(row, 1);
    cellSub.value = opts.subtitulo;
    cellSub.font = { name: "Arial", size: 9, italic: true, color: { argb: TORG_GRAY } };
    cellSub.alignment = { vertical: "middle", horizontal: "left" };
    cellSub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
    for (let c = 1; c <= totalCols; c++) {
      bordaFina(ws.getCell(row, c));
    }
    ws.getRow(row).height = 18;
    row++;
  }

  // === KPIs (linhas 5+) ===
  if (opts.kpis && opts.kpis.length > 0) {
    for (const kpi of opts.kpis) {
      ws.mergeCells(row, 1, row, totalCols);
      const cell = ws.getCell(row, 1);
      cell.value = kpi;
      cell.font = { name: "Arial", size: 9, bold: true, color: { argb: TORG_DARK } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
      for (let c = 1; c <= totalCols; c++) {
        bordaFina(ws.getCell(row, c));
      }
      ws.getRow(row).height = 20;
      row++;
    }
  }

  // Linha em branco separadora
  ws.getRow(row).height = 6;
  row++;

  return { workbook: wb, sheet: ws, linhaInicio: row };
}

/**
 * Auto-detecta o codigo do documento pelo titulo.
 */
function detectarCodigoDoc(titulo) {
  if (!titulo) return null;
  const t = titulo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [key, code] of Object.entries(DOC_CODES)) {
    const k = key.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (t.includes(k)) return code;
  }
  if (t.includes("programacao")) return "REL-PRD-003";
  if (t.includes("mapa")) return "REL-PRD-002";
  if (t.includes("peca") || t.includes("corte")) return "REL-PRD-001";
  return null;
}

/**
 * Adiciona cabecalho de tabela estilizado (fundo azul escuro, texto branco, bordas).
 * @param {ExcelJS.Worksheet} ws
 * @param {number} linha
 * @param {string[]} headers
 */
export function adicionarHeaderTabela(ws, linha, headers) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(linha, i + 1);
    cell.value = h;
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "medium", color: { argb: HEADER_BORDER } },
      bottom: { style: "medium", color: { argb: HEADER_BORDER } },
      left: { style: "thin", color: { argb: HEADER_BORDER } },
      right: { style: "thin", color: { argb: HEADER_BORDER } },
    };
  });
  ws.getRow(linha).height = 24;
}

/**
 * Adiciona uma linha de dados com formatacao e bordas.
 * @param {ExcelJS.Worksheet} ws
 * @param {number} linha
 * @param {any[]} valores
 * @param {Object} [opts]
 * @param {string} [opts.fillColor] - Cor de fundo ARGB (sem #)
 * @param {boolean} [opts.bold]
 * @param {Object} [opts.fontColors] - Map de coluna (0-based) -> cor ARGB
 * @param {Object} [opts.alinhamento] - Map de coluna (0-based) -> horizontal alignment
 */
export function adicionarLinhaTabela(ws, linha, valores, opts = {}) {
  valores.forEach((v, i) => {
    const cell = ws.getCell(linha, i + 1);
    cell.value = v;
    cell.font = {
      name: "Arial",
      size: 9,
      bold: opts.bold || false,
      color: opts.fontColors?.[i] ? { argb: opts.fontColors[i] } : { argb: "333333" },
    };
    if (opts.fillColor) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fillColor } };
    }
    cell.alignment = {
      vertical: "middle",
      horizontal: opts.alinhamento?.[i] || "left",
    };
    cell.border = {
      top: { style: "hair", color: { argb: "D0D5DD" } },
      bottom: { style: "hair", color: { argb: "D0D5DD" } },
      left: { style: "thin", color: { argb: "E5E7EB" } },
      right: { style: "thin", color: { argb: "E5E7EB" } },
    };
  });
}

/**
 * Adiciona linha de totais com fundo cinza e bordas fortes.
 */
export function adicionarLinhaTotais(ws, linha, valores) {
  adicionarLinhaTabela(ws, linha, valores, {
    fillColor: TOTAL_BG,
    bold: true,
    fontColors: Object.fromEntries(valores.map((_, i) => [i, TORG_DARK])),
  });
  valores.forEach((_, i) => {
    ws.getCell(linha, i + 1).border = {
      top: { style: "medium", color: { argb: TORG_BLUE } },
      bottom: { style: "medium", color: { argb: TORG_BLUE } },
      left: { style: "thin", color: { argb: TORG_BLUE } },
      right: { style: "thin", color: { argb: TORG_BLUE } },
    };
  });
  ws.getRow(linha).height = 22;
}

/**
 * Adiciona rodape de aprovacao ISO 9001.
 * Cria 3 campos: Elaborado por / Verificado por / Aprovado por.
 * @param {ExcelJS.Worksheet} ws
 * @param {number} linha - Linha onde comecar o rodape (deixe 2 linhas de espaco apos os dados)
 * @param {number} totalColunas
 * @param {Object} [opts]
 * @param {string} [opts.elaboradoPor] - Nome de quem elaborou
 * @param {string} [opts.verificadoPor] - Nome de quem verificou
 * @param {string} [opts.aprovadoPor] - Nome de quem aprovou
 */
export function adicionarRodapeISO(ws, linha, totalColunas, opts = {}) {
  const colsPerBlock = Math.floor(totalColunas / 3);
  const blocos = [
    { titulo: "Elaborado por:", valor: opts.elaboradoPor || "" },
    { titulo: "Verificado por:", valor: opts.verificadoPor || "" },
    { titulo: "Aprovado por:", valor: opts.aprovadoPor || "" },
  ];

  let startCol = 1;
  for (let b = 0; b < blocos.length; b++) {
    const endCol = b === 2 ? totalColunas : startCol + colsPerBlock - 1;

    // Titulo do bloco
    ws.mergeCells(linha, startCol, linha, endCol);
    const cellTitulo = ws.getCell(linha, startCol);
    cellTitulo.value = blocos[b].titulo;
    cellTitulo.font = { name: "Arial", size: 8, bold: true, color: { argb: TORG_DARK } };
    cellTitulo.alignment = { vertical: "middle", horizontal: "center" };
    cellTitulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F0F4F8" } };
    for (let c = startCol; c <= endCol; c++) {
      bordaMedia(ws.getCell(linha, c));
    }

    // Valor (nome + espaco para assinatura)
    ws.mergeCells(linha + 1, startCol, linha + 1, endCol);
    const cellValor = ws.getCell(linha + 1, startCol);
    cellValor.value = blocos[b].valor || "";
    cellValor.font = { name: "Arial", size: 9, color: { argb: TORG_GRAY } };
    cellValor.alignment = { vertical: "middle", horizontal: "center" };
    for (let c = startCol; c <= endCol; c++) {
      bordaMedia(ws.getCell(linha + 1, c));
    }

    // Linha de data
    ws.mergeCells(linha + 2, startCol, linha + 2, endCol);
    const cellData = ws.getCell(linha + 2, startCol);
    cellData.value = "Data: ___/___/______";
    cellData.font = { name: "Arial", size: 8, color: { argb: TORG_GRAY } };
    cellData.alignment = { vertical: "middle", horizontal: "center" };
    for (let c = startCol; c <= endCol; c++) {
      bordaMedia(ws.getCell(linha + 2, c));
    }

    startCol = endCol + 1;
  }

  ws.getRow(linha).height = 18;
  ws.getRow(linha + 1).height = 24;
  ws.getRow(linha + 2).height = 16;
}

/**
 * Adiciona legenda de cores/status ao relatorio.
 * @param {ExcelJS.Worksheet} ws
 * @param {number} linha
 * @param {Array<{cor: string, label: string}>} itens
 * @param {number} totalColunas
 */
export function adicionarLegenda(ws, linha, itens, totalColunas) {
  ws.mergeCells(linha, 1, linha, totalColunas);
  const cellTitulo = ws.getCell(linha, 1);
  cellTitulo.value = "Legenda: " + itens.map((it) => `[${it.label}]`).join("  ");
  cellTitulo.font = { name: "Arial", size: 8, italic: true, color: { argb: TORG_GRAY } };
  cellTitulo.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(linha).height = 16;
}

/**
 * Faz download do workbook como XLSX.
 * @param {ExcelJS.Workbook} wb
 * @param {string} fileName
 */
export async function downloadWorkbook(wb, fileName) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// Re-exporta constantes para uso externo
export const CORES = {
  TORG_BLUE, TORG_DARK, TORG_GRAY, TORG_ORANGE,
  HEADER_BG, LIGHT_GREEN, LIGHT_ORANGE, LIGHT_BLUE, TOTAL_BG,
};
