/**
 * Utilitario para gerar relatorios Excel profissionais com branding Torg Metal.
 * Segue padrao ISO 9001 de controle de documentos.
 * Usa ExcelJS para suporte a imagens e formatacao avancada.
 * Compatível com navegador e rotas do servidor; o download só roda no navegador.
 */

// Cores da marca
import { refFORM } from "@/lib/sgq-forms";
import {registrarTabelaExcel,bufferWorkbookTorg} from './excel-refinamento';
export {bufferWorkbookTorg} from './excel-refinamento';

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
  "Controle de Producao": "REL-PRD-004",
  "Relatorio de Expedicao": "REL-EXP-001",
  "Confronto de Expedicao": "REL-EXP-002",
};

/**
 * Carrega o logo da Torg como ArrayBuffer (para ExcelJS addImage).
 * @returns {Promise<ArrayBuffer>}
 */
async function carregarLogo() {
  // ⚠ NO SERVIDOR NAO EXISTE "/torg-logo-excel.png". Este modulo nasceu client-side, mas a
  // planilha da LPC e da LE do portal do cliente e gerada NA ROTA (o corte do peso tem que ser
  // no servidor). Sem este ramo o arquivo sairia sem cabecalho — e planilha sem cabecalho nao e
  // o padrao Torg. O logo vem embutido justamente para nao depender do sistema de arquivos.
  if (typeof window === "undefined") {
    try {
      const { LOGO_EXCEL_B64 } = await import("./torg-logo-excel");
      const bin = Buffer.from(LOGO_EXCEL_B64, "base64");
      return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
    } catch {
      return null;
    }
  }
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
 * Cabeçalho em três faixas: marca/logo, título em largura integral e
 * identificação do documento. Filtros e indicadores vêm abaixo, antes da tabela.
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
  const { sheet, linhaInicio } = await adicionarFolhaTorg(wb, opts);
  return { workbook: wb, sheet, linhaInicio };
}

/**
 * Acrescenta uma folha JÁ COM O CABEÇALHO TORG a um workbook existente.
 *
 * ⚠⚠ POR QUE ISTO FOI EXTRAÍDO. Vitor (07/09/2026), sobre o caderno de pintura: "só a planilha do
 * pintor e qual tinta usar que está sem a formatação padrão da TORG". Estava mesmo: o cabeçalho ISO
 * (logo, controle de documento, KPIs) morava dentro de `criarRelatorioTorg`, que CRIA o workbook —
 * então a primeira folha saía no padrão e toda folha acrescentada depois saía crua. Qualquer
 * relatório multi-aba do portal tinha o mesmo defeito à espera.
 *
 * `criarRelatorioTorg` continua igual para quem chama; ela agora é esta função mais o workbook.
 *
 * @param {ExcelJS.Workbook} wb
 * @param {Object} opts mesmos campos de `criarRelatorioTorg`
 * @returns {Promise<{sheet: ExcelJS.Worksheet, linhaInicio: number}>}
 */
export async function adicionarFolhaTorg(wb, opts) {
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
  ws._torgRelatorio=true;

  // Resumos estreitos têm cabeçalho empilhado: preserva as colunas reais e evita
  // mesclas sobrepostas ou colunas extras vazias na impressão.
  const totalCols = Math.max(1, opts.totalColunas || 10);

  // Detectar codigo do documento
  const codigoDoc = opts.codigoDoc || detectarCodigoDoc(opts.titulo) || "REL-GER-001";

  const agora = new Date();
  const dataEmissao = agora.toLocaleDateString("pt-BR");
  const horaEmissao = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // As três linhas fixas preservam as coordenadas dos relatórios. O título
  // usa a largura inteira: não depende mais da largura das colunas dos dados.
  for (let r = 1; r <= 3; r++) {
    if (totalCols > 1) ws.mergeCells(r, 1, r, totalCols);
  }
  for (let c = 1; c <= totalCols; c++) ws.getColumn(c).width = 20;
  const empresa = ws.getCell('A1');
  empresa.value = totalCols === 1 ? '' : 'TORG METAL';
  empresa.font = { name: 'Arial', size: 13, bold: true, color: { argb: TORG_BLUE } };
  empresa.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  const titulo = ws.getCell('A2');
  titulo.value = opts.titulo || 'Relatório';
  titulo.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
  titulo.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
  const controle = ws.getCell('A3');
  const referenciaForm = opts.form ? refFORM(opts.form) : '';
  controle.value = `${codigoDoc} · Revisão ${opts.revisao || '00'} · Emissão ${dataEmissao} ${horaEmissao}${referenciaForm ? ' · ' + referenciaForm : ''}`;
  controle.font = { name: 'Arial', size: 9, color: { argb: TORG_GRAY } };
  controle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F4F8' } };
  controle.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
  ws.getRow(1).height = 44;
  ws.getRow(2).height = 32;
  ws.getRow(3).height = 24;
  const logo = await carregarLogo();
  if (logo) {
    const id = wb.addImage({ buffer: logo, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.12, row: 0.08 }, ext: { width: 90, height: 50 } });
  }

  // === SUBTITULO / FILTROS (linha 4) ===
  let row = 4;
  if (opts.subtitulo) {
    ws.mergeCells(row, 1, row, totalCols);
    const cellSub = ws.getCell(row, 1);
    cellSub.value = opts.subtitulo;
    cellSub.font = { name: "Arial", size: 9, color: { argb: TORG_GRAY } };
    cellSub.alignment = { vertical: "middle", horizontal: "left" };
    cellSub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
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
      ws.getRow(row).height = 20;
      row++;
    }
  }

  // Linha em branco separadora
  ws.mergeCells(row, 1, row, totalCols);
  ws.getCell(row,1).fill={type:'pattern',pattern:'solid',fgColor:{argb:TORG_ORANGE}};
  ws.getRow(row).height = 3;
  row++;

  return { sheet: ws, linhaInicio: row };
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
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
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
  // Registra o cabeçalho p/ o downloadWorkbook aplicar o AutoFiltro do Excel.
  ws._torgFiltro = { headerRow: linha, cols: headers.length, lastRow: linha };
  registrarTabelaExcel(ws,linha,headers);
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
 * @param {number} [opts.fontSize] - Tamanho da fonte (default 9)
 * @param {number} [opts.rowHeight] - Altura da linha em pt (default: auto)
 * @param {boolean} [opts.wrapText] - Quebrar texto (default false)
 */
export function adicionarLinhaTabela(ws, linha, valores, opts = {}) {
  const fontSize = opts.fontSize || 10;
  valores.forEach((v, i) => {
    const cell = ws.getCell(linha, i + 1);
    cell.value = v;
    cell.font = {
      name: "Arial",
      size: fontSize,
      bold: opts.bold || false,
      color: opts.fontColors?.[i] ? { argb: opts.fontColors[i] } : { argb: "333333" },
    };
    if (opts.fillColor) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fillColor } };
    }
    // ⚠⚠ NUMERO NASCE A DIREITA. Vitor (01/09/2026): "nas proximas planilhas melhore a
    // centralizacao desses numeros". O padrao era "left" para tudo: nas linhas de dados o chamador
    // corrigia a mao com `alinhamento`, mas a linha de TOTAIS nao passava nada — entao o total saia
    // encostado a esquerda embaixo de uma coluna alinhada a direita, e os digitos nao batiam com os
    // da coluna. Alinhar numero a direita e o que faz a casa decimal cair na mesma vertical; e o
    // unico jeito de conferir uma coluna de bater o olho. `alinhamento` explicito continua mandando.
    cell.alignment = {
      vertical: "middle",
      horizontal: opts.alinhamento?.[i] || (typeof v === "number" || v?.formula || v?.sharedFormula ? "right" : "left"),
      wrapText: opts.wrapText || false,
    };
    cell.border = {
      top: { style: "hair", color: { argb: "D0D5DD" } },
      bottom: { style: "hair", color: { argb: "D0D5DD" } },
      left: { style: "hair", color: { argb: "E5E7EB" } },
      right: { style: "hair", color: { argb: "E5E7EB" } },
    };
  });
  if (opts.rowHeight) {
    ws.getRow(linha).height = opts.rowHeight;
  }
  if (ws._torgFiltro && linha > ws._torgFiltro.lastRow) ws._torgFiltro.lastRow = linha;
  const tabela=ws._torgTabelas?.at(-1);
  if(tabela&&linha>tabela.headerRow)tabela.rows.add(linha);
}

/**
 * Adiciona linha de totais com fundo cinza e bordas fortes.
 */
export function adicionarLinhaTotais(ws, linha, valores, opts = {}) {
  adicionarLinhaTabela(ws, linha, valores, {
    // ⚠ repassa `opts`: sem isso a linha de totais ficava presa em 9pt e altura fixa, enquanto o
    // corpo da folha do montador roda em 13pt — o total saia menor que os numeros que ele soma.
    ...opts,
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
  ws.getRow(linha).height = opts.rowHeight || 22;
  // A linha de totais não entra no filtro (senão some ao filtrar).
  if (ws._torgFiltro) ws._torgFiltro.lastRow = linha - 1;
  ws._torgTabelas?.at(-1)?.totais.add(linha);
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
  if (totalColunas < 3) {
    for (const [i, [titulo, valor]] of [
      ['Elaborado por:', opts.elaboradoPor],
      ['Verificado por:', opts.verificadoPor],
      ['Aprovado por:', opts.aprovadoPor],
    ].entries()) {
      const r = linha + i * 2;
      if (totalColunas > 1) ws.mergeCells(r, 1, r, totalColunas);
      const cell = ws.getCell(r, 1);
      cell.value = `${titulo} ${valor || '________________'}`;
      cell.font = { name: 'Arial', size: 9, color: { argb: TORG_DARK } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      ws.getRow(r).height = 24;
      if (totalColunas > 1) ws.mergeCells(r + 1, 1, r + 1, totalColunas);
      ws.getCell(r + 1, 1).value = 'Data: ___/___/______';
      ws.getCell(r + 1, 1).font = { name: 'Arial', size: 8, color: { argb: TORG_GRAY } };
    }
    return;
  }
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
  // Finaliza a apresentação, preservando filtros específicos do relatório.
  const buffer = await bufferWorkbookTorg(wb);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Dá tempo para o navegador começar a leitura do download antes de liberar o Blob.
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

// Re-exporta constantes para uso externo
export const CORES = {
  TORG_BLUE, TORG_DARK, TORG_GRAY, TORG_ORANGE,
  HEADER_BG, LIGHT_GREEN, LIGHT_ORANGE, LIGHT_BLUE, TOTAL_BG,
};
