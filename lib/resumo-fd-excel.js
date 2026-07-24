// Monta o workbook do "Resumo de Compras — Faturamento Direto" pro cliente.
// Separado do componente (que só faz fetch + download) pra dar pra testar a
// montagem/layout num stub node. Segue o padrão Torg (lib/excel-relatorio.js):
// cabeçalho ISO 9001 + logo, cores da marca.
import {
  criarRelatorioTorg,
  adicionarHeaderTabela,
  adicionarLinhaTabela,
} from "@/lib/excel-relatorio";

const NAVY = "0D1F3C"; // faixa navy da marca (igual PDFs/e-mails)
const CINZA = "F1F5F9";
const CINZA_TOTAL = "E2E8F0";
const FMT_MOEDA = '"R$"\\ #,##0.00';
const FMT_QTD = "#,##0.###";

const fmtDataBR = (v) => {
  if (!v) return "—";
  const s = typeof v === "string" ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10);
  return s.split("-").reverse().join("/");
};

/** Faixa mesclada de largura total (nome do fornecedor / linhas de dados). */
function banda(ws, row, totalCols, texto, { fill, cor, size = 10, bold = true, height = 18 }) {
  ws.mergeCells(row, 1, row, totalCols);
  const cell = ws.getCell(row, 1);
  cell.value = texto;
  cell.font = { name: "Arial", size, bold, color: { argb: cor } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  cell.border = {
    left: { style: "thin", color: { argb: "CBD5E1" } },
    right: { style: "thin", color: { argb: "CBD5E1" } },
  };
  ws.getRow(row).height = height;
}

/**
 * @param {{op:{numero,obra,cliente,refCliente}, fornecedores:Array, totalGeral:number}} dados
 * @returns {Promise<ExcelJS.Workbook>}
 */
export async function montarResumoFDWorkbook({ op, fornecedores = [], totalGeral = 0 }) {
  const headers = ["Código", "Descrição", "Qtd", "Un", "Preço Unit.", "Total"];
  const subtitulo = [
    `OP ${op?.numero || "—"}`,
    op?.obra ? `Obra: ${op.obra}` : null,
    op?.cliente ? `Cliente: ${op.cliente}` : null,
    op?.refCliente ? `Ref. do cliente: ${op.refCliente}` : null,
  ].filter(Boolean).join("  ·  ");

  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: "Resumo de Compras — Faturamento Direto",
    subtitulo,
    kpis: [
      `${fornecedores.length} fornecedor(es) em faturamento direto`,
      `Total dos itens: R$ ${Number(totalGeral).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ],
    totalColunas: headers.length,
    nomePlanilha: `Resumo FD OP ${op?.numero || ""}`.slice(0, 31),
    codigoDoc: "REL-CMP-002",
  });

  // Larguras (6 colunas). Descrição larga; valores confortáveis.
  ws.columns = [{ width: 16 }, { width: 52 }, { width: 12 }, { width: 7 }, { width: 16 }, { width: 18 }];

  let row = linhaInicio;

  for (const f of fornecedores) {
    // Nome do fornecedor (faixa navy)
    const nome = f.razaoSocial || f.nomeFornecedor || "Fornecedor";
    banda(ws, row, headers.length, nome, { fill: NAVY, cor: "FFFFFF", size: 11, height: 22 }); row++;
    // Dados cadastrais (2 faixas claras)
    banda(ws, row, headers.length,
      `CNPJ: ${f.cnpj || "—"}      •      Endereço: ${f.endereco || "—"}`,
      { fill: CINZA, cor: "334155", size: 9, bold: false }); row++;
    banda(ws, row, headers.length,
      `Forma de pagamento: ${f.formaPagamento || "—"}      •      Nº da proposta: ${f.numeroProposta || "—"}      •      Prazo de entrega: ${f.prazoEntregaUnico ? fmtDataBR(f.prazoEntregaUnico) : "conforme proposta"}`,
      { fill: CINZA, cor: "334155", size: 9, bold: false }); row++;

    // Cabeçalho da tabela de itens
    adicionarHeaderTabela(ws, row, headers); row++;

    for (const it of f.itens) {
      adicionarLinhaTabela(ws, row, [
        it.codigo || "—",
        it.descricao || "—",
        Number(it.qtd || 0),
        it.unidade || "",
        Number(it.precoUnit || 0),
        Number(it.total || 0),
      ], {
        alinhamento: { 2: "right", 3: "center", 4: "right", 5: "right" },
      });
      ws.getCell(row, 3).numFmt = FMT_QTD;
      ws.getCell(row, 5).numFmt = FMT_MOEDA;
      ws.getCell(row, 6).numFmt = FMT_MOEDA;
      row++;
    }

    // Subtotal do fornecedor
    ws.mergeCells(row, 1, row, 5);
    const cSub = ws.getCell(row, 1);
    cSub.value = "Total do fornecedor";
    cSub.font = { name: "Arial", size: 9, bold: true, color: { argb: "0D1F3C" } };
    cSub.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    cSub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_TOTAL } };
    const cSubVal = ws.getCell(row, 6);
    cSubVal.value = Number(f.total || 0);
    cSubVal.numFmt = FMT_MOEDA;
    cSubVal.font = { name: "Arial", size: 9, bold: true, color: { argb: "0D1F3C" } };
    cSubVal.alignment = { vertical: "middle", horizontal: "right" };
    cSubVal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_TOTAL } };
    for (let c = 1; c <= headers.length; c++) {
      ws.getCell(row, c).border = { top: { style: "medium", color: { argb: "94A3B8" } }, bottom: { style: "thin", color: { argb: "CBD5E1" } } };
    }
    ws.getRow(row).height = 20;
    row++;

    // separador
    ws.getRow(row).height = 8; row++;
  }

  // Total geral FD
  if (fornecedores.length > 1) {
    ws.mergeCells(row, 1, row, 5);
    const cg = ws.getCell(row, 1);
    cg.value = "TOTAL GERAL — FATURAMENTO DIRETO";
    cg.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cg.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    cg.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    const cgv = ws.getCell(row, 6);
    cgv.value = Number(totalGeral || 0);
    cgv.numFmt = FMT_MOEDA;
    cgv.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cgv.alignment = { vertical: "middle", horizontal: "right" };
    cgv.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    ws.getRow(row).height = 22;
    row++;
  }

  // Nota de rodapé
  row++;
  ws.mergeCells(row, 1, row, headers.length);
  const nota = ws.getCell(row, 1);
  nota.value = "Documento gerado pelo Workspace Torg. Valores conforme proposta de cada fornecedor; impostos e frete conforme condições da proposta / nota fiscal.";
  nota.font = { name: "Arial", size: 8, italic: true, color: { argb: "64748B" } };
  nota.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  ws.getRow(row).height = 24;

  return workbook;
}
