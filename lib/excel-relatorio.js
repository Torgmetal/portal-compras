/**
 * Utilitário para gerar relatórios Excel profissionais com branding Torg Metal.
 * Usa ExcelJS para suporte a imagens e formatação avançada.
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

/**
 * Carrega o logo da Torg como ArrayBuffer (para ExcelJS addImage).
 * @returns {Promise<ArrayBuffer>}
 */
async function carregarLogo() {
  try {
    const res = await fetch("/torg-logo-excel.png");
    if (!res.ok) throw new Error("Logo não encontrado");
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Cria um workbook ExcelJS com cabeçalho padrão Torg Metal.
 * @param {Object} opts
 * @param {string} opts.titulo - Título do relatório (ex: "Controle de Peças")
 * @param {string} [opts.subtitulo] - Subtítulo (ex: "OP 085 · Corte · Pendentes")
 * @param {string[]} [opts.kpis] - Linhas de KPI (ex: ["Total: 150 peças", "Peso: 12.5 t"])
 * @param {number} [opts.totalColunas=10] - Quantas colunas o header abrange
 * @returns {Promise<{workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, linhaInicio: number}>}
 */
export async function criarRelatorioTorg(opts) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Torg Metal — Workspace";
  wb.created = new Date();

  const ws = wb.addWorksheet(opts.nomePlanilha || "Relatório", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });

  const totalCols = opts.totalColunas || 10;
  let row = 1;

  // Logo
  const logoData = await carregarLogo();
  if (logoData) {
    const imgId = wb.addImage({ buffer: logoData, extension: "png" });
    ws.addImage(imgId, {
      tl: { col: 0, row: 0 },
      ext: { width: 160, height: 90 },
    });
    // Espaço para o logo
    ws.getRow(1).height = 25;
    ws.getRow(2).height = 25;
    ws.getRow(3).height = 25;
    row = 1;
  }

  // Título — coluna ao lado do logo
  const colTitulo = logoData ? 3 : 1;

  // Linha 1: TORG METAL + título
  const cellTitulo = ws.getCell(1, colTitulo);
  cellTitulo.value = `TORG METAL  ·  ${opts.titulo || "Relatório"}`;
  cellTitulo.font = { name: "Arial", size: 14, bold: true, color: { argb: TORG_BLUE } };
  cellTitulo.alignment = { vertical: "middle" };

  // Linha 2: Estruturas Metálicas
  const cellSub1 = ws.getCell(2, colTitulo);
  cellSub1.value = "Estruturas Metálicas";
  cellSub1.font = { name: "Arial", size: 9, color: { argb: TORG_GRAY } };
  cellSub1.alignment = { vertical: "middle" };

  // Linha 3: Subtítulo + data
  const agora = new Date().toLocaleDateString("pt-BR") + " " +
    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const cellSub2 = ws.getCell(3, colTitulo);
  cellSub2.value = opts.subtitulo ? `${opts.subtitulo}  —  ${agora}` : agora;
  cellSub2.font = { name: "Arial", size: 9, color: { argb: TORG_GRAY }, italic: true };

  // Linha separadora
  row = 4;
  for (let c = 1; c <= totalCols; c++) {
    const cell = ws.getCell(row, c);
    cell.border = { bottom: { style: "medium", color: { argb: TORG_BLUE } } };
  }

  row = 5;

  // KPIs
  if (opts.kpis && opts.kpis.length > 0) {
    for (const kpi of opts.kpis) {
      const cell = ws.getCell(row, 1);
      cell.value = kpi;
      cell.font = { name: "Arial", size: 9, bold: true, color: { argb: TORG_DARK } };
      ws.mergeCells(row, 1, row, totalCols);
      row++;
    }
    row++; // espaço
  }

  return { workbook: wb, sheet: ws, linhaInicio: row };
}

/**
 * Adiciona cabeçalho de tabela estilizado (fundo azul escuro, texto branco).
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
      bottom: { style: "thin", color: { argb: "CCCCCC" } },
    };
  });
  ws.getRow(linha).height = 22;
}

/**
 * Adiciona uma linha de dados com formatação.
 * @param {ExcelJS.Worksheet} ws
 * @param {number} linha
 * @param {any[]} valores
 * @param {Object} [opts]
 * @param {string} [opts.fillColor] - Cor de fundo ARGB (sem #)
 * @param {boolean} [opts.bold]
 * @param {Object} [opts.fontColors] - Map de coluna (0-based) → cor ARGB
 * @param {Object} [opts.alinhamento] - Map de coluna (0-based) → horizontal alignment
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
      bottom: { style: "hair", color: { argb: "E0E0E0" } },
    };
  });
}

/**
 * Adiciona linha de totais com fundo cinza.
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
    };
  });
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
