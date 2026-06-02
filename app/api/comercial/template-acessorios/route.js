import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { CATALOGO_ACESSORIOS, CATEGORIAS_CATALOGO } from "@/lib/catalogo-acessorios";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const maxDuration = 15;

// Cores TORG
const TORG_BLUE = "006EAB";
const TORG_DARK = "002945";
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: TORG_DARK } };
const HEADER_FONT = { bold: true, color: { argb: "FFFFFF" }, size: 10, name: "Arial" };
const SECTION_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "E8F4FD" } };
const SECTION_FONT = { bold: true, color: { argb: TORG_DARK }, size: 11, name: "Arial" };
const SUBTOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "F0F4F8" } };
const SUBTOTAL_FONT = { bold: true, color: { argb: TORG_DARK }, size: 10, name: "Arial" };
const CELL_FONT = { size: 10, name: "Arial", color: { argb: "333333" } };
const BLUE_FONT = { size: 10, name: "Arial", color: { argb: TORG_BLUE }, bold: false };
const THIN_BORDER = {
  top: { style: "thin", color: { argb: "D0D5DD" } },
  bottom: { style: "thin", color: { argb: "D0D5DD" } },
  left: { style: "thin", color: { argb: "D0D5DD" } },
  right: { style: "thin", color: { argb: "D0D5DD" } },
};

const SECOES = [
  { num: 1, titulo: "TELHAS DE COBERTURA E FECHAMENTO", catCatalogo: "TELHAS", linhas: 8 },
  { num: 2, titulo: "GRADE DE PISO (GRADIL)", catCatalogo: "GRADES_DE_PISO", linhas: 6 },
  { num: 3, titulo: "STEEL DECK", catCatalogo: "STEEL_DECK", linhas: 5 },
  { num: 4, titulo: "PAINEIS ISO (FACHADA / SANDUICHE)", catCatalogo: "PAINEIS_ISO", linhas: 6 },
  { num: 5, titulo: "ACESSORIOS E COMPLEMENTOS (calhas, rufos, cumeeiras)", catCatalogo: null, linhas: 5 },
];

export async function GET() {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "TORG Metal — Portal de Compras";
    wb.created = new Date();

    // ══════════════════════════════════════
    // ABA 1: Composicao de Areas
    // ══════════════════════════════════════
    const ws = wb.addWorksheet("Composicao de Areas", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
    });

    ws.columns = [
      { key: "item", width: 6 },
      { key: "produto", width: 48 },
      { key: "area", width: 14 },
      { key: "peso_m2", width: 14 },
      { key: "peso_total", width: 14 },
      { key: "valor_unit", width: 16 },
      { key: "valor_total", width: 16 },
    ];

    // Header do documento
    ws.mergeCells("A1:G1");
    const titleCell = ws.getCell("A1");
    titleCell.value = "COMPOSICAO DE AREAS DE PROJETO";
    titleCell.font = { bold: true, size: 14, name: "Arial", color: { argb: TORG_DARK } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 30;

    ws.mergeCells("A2:E2");
    ws.getCell("A2").value = "Sistema de Gestao da Qualidade — Setor: Comercial";
    ws.getCell("A2").font = { size: 9, name: "Arial", color: { argb: "666666" } };
    ws.getCell("F2").value = "Codigo:";
    ws.getCell("F2").font = { size: 9, name: "Arial", bold: true };
    ws.getCell("G2").value = "FOR-00";
    ws.getCell("G2").font = BLUE_FONT;

    // Campos de preenchimento
    const campos = [
      { row: 4, labelA: "Cliente:", labelF: "OP / Prop.:" },
      { row: 5, labelA: "Obra / Projeto:", labelF: "Responsavel:" },
      { row: 6, labelA: "Elaborado por:", labelF: "Data:" },
    ];
    for (const c of campos) {
      ws.getCell(`A${c.row}`).value = c.labelA;
      ws.getCell(`A${c.row}`).font = { bold: true, size: 10, name: "Arial" };
      ws.getCell(`B${c.row}`).font = BLUE_FONT;
      ws.getCell(`B${c.row}`).border = { bottom: { style: "thin", color: { argb: TORG_BLUE } } };
      ws.mergeCells(`B${c.row}:E${c.row}`);
      ws.getCell(`F${c.row}`).value = c.labelF;
      ws.getCell(`F${c.row}`).font = { bold: true, size: 10, name: "Arial" };
      ws.getCell(`G${c.row}`).font = BLUE_FONT;
      ws.getCell(`G${c.row}`).border = { bottom: { style: "thin", color: { argb: TORG_BLUE } } };
    }

    // Instrucoes
    ws.mergeCells("A8:G8");
    ws.getCell("A8").value = "Selecione o Produto na lista (da aba Banco de Dados) e informe a Area em m². Peso e valores totais sao calculados automaticamente.";
    ws.getCell("A8").font = { italic: true, size: 9, name: "Arial", color: { argb: "666666" } };
    ws.getRow(8).height = 20;

    let currentRow = 10;

    // Lista completa de nomes de produtos para validacao (dropdown)
    const todosNomes = CATALOGO_ACESSORIOS.map((p) => p.nome);

    for (const secao of SECOES) {
      // Header da secao
      ws.mergeCells(`A${currentRow}:G${currentRow}`);
      const secCell = ws.getCell(`A${currentRow}`);
      secCell.value = `${secao.num}. ${secao.titulo}`;
      secCell.font = SECTION_FONT;
      secCell.fill = SECTION_FILL;
      secCell.border = THIN_BORDER;
      ws.getRow(currentRow).height = 24;
      currentRow++;

      // Header de colunas
      const colHeaders = ["Item", "Produto (selecione na lista)", "Area\n(m²)", "Peso\n(kg/m²)", "Peso Total\n(kg)", "Valor Unit.\n(R$/m²)", "Valor Total\n(R$)"];
      const headerRow = ws.getRow(currentRow);
      colHeaders.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        cell.font = HEADER_FONT;
        cell.fill = HEADER_FILL;
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = THIN_BORDER;
      });
      headerRow.height = 28;
      currentRow++;

      // Produtos desta categoria para dropdown
      const produtosCat = secao.catCatalogo
        ? CATALOGO_ACESSORIOS.filter((p) => p.categoria === secao.catCatalogo).map((p) => p.nome)
        : [];

      const firstDataRow = currentRow;

      // Linhas de dados
      for (let i = 0; i < secao.linhas; i++) {
        const r = currentRow;
        const row = ws.getRow(r);

        // Coluna A: numero do item
        row.getCell(1).value = i + 1;
        row.getCell(1).font = CELL_FONT;
        row.getCell(1).alignment = { horizontal: "center" };

        // Coluna B: produto (dropdown)
        const prodCell = row.getCell(2);
        prodCell.font = BLUE_FONT;
        if (produtosCat.length > 0) {
          prodCell.dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`"${produtosCat.join(",")}"`],
            showErrorMessage: true,
            errorTitle: "Produto invalido",
            error: "Selecione um produto da lista ou deixe em branco",
          };
        }

        // Coluna C: area m2 (input do usuario — azul)
        row.getCell(3).font = BLUE_FONT;
        row.getCell(3).numFmt = '#,##0.00';
        row.getCell(3).alignment = { horizontal: "right" };

        // Coluna D: peso kg/m2 (VLOOKUP do Banco de Dados)
        const pesoCell = row.getCell(4);
        pesoCell.value = { formula: `IF(B${r}="","",VLOOKUP(B${r},'Banco de Dados'!B:C,2,FALSE))` };
        pesoCell.numFmt = '#,##0.00';
        pesoCell.font = CELL_FONT;
        pesoCell.alignment = { horizontal: "right" };

        // Coluna E: peso total = area * peso/m2
        const pesoTotalCell = row.getCell(5);
        pesoTotalCell.value = { formula: `IF(OR(C${r}="",D${r}=""),0,C${r}*D${r})` };
        pesoTotalCell.numFmt = '#,##0.00';
        pesoTotalCell.font = CELL_FONT;
        pesoTotalCell.alignment = { horizontal: "right" };

        // Coluna F: valor unitario R$/m2 (input do usuario — azul)
        row.getCell(6).font = BLUE_FONT;
        row.getCell(6).numFmt = '#,##0.00';
        row.getCell(6).alignment = { horizontal: "right" };

        // Coluna G: valor total = area * valor unit
        const valorTotalCell = row.getCell(7);
        valorTotalCell.value = { formula: `IF(OR(C${r}="",F${r}=""),0,C${r}*F${r})` };
        valorTotalCell.numFmt = '#,##0.00';
        valorTotalCell.font = CELL_FONT;
        valorTotalCell.alignment = { horizontal: "right" };

        // Bordas em todas as celulas
        for (let col = 1; col <= 7; col++) {
          row.getCell(col).border = THIN_BORDER;
        }

        currentRow++;
      }

      // Linha de subtotal
      const subRow = ws.getRow(currentRow);
      subRow.getCell(1).value = "SUBTOTAL";
      ws.mergeCells(`A${currentRow}:D${currentRow}`);
      subRow.getCell(1).font = SUBTOTAL_FONT;
      subRow.getCell(1).fill = SUBTOTAL_FILL;
      subRow.getCell(1).alignment = { horizontal: "right" };

      subRow.getCell(5).value = { formula: `SUM(E${firstDataRow}:E${currentRow - 1})` };
      subRow.getCell(5).numFmt = '#,##0.00';
      subRow.getCell(5).font = SUBTOTAL_FONT;
      subRow.getCell(5).fill = SUBTOTAL_FILL;

      subRow.getCell(6).fill = SUBTOTAL_FILL;

      subRow.getCell(7).value = { formula: `SUM(G${firstDataRow}:G${currentRow - 1})` };
      subRow.getCell(7).numFmt = '#,##0.00';
      subRow.getCell(7).font = SUBTOTAL_FONT;
      subRow.getCell(7).fill = SUBTOTAL_FILL;

      for (let col = 1; col <= 7; col++) {
        subRow.getCell(col).border = THIN_BORDER;
      }

      currentRow += 2; // espaco entre secoes
    }

    // TOTAL GERAL
    const totalRow = ws.getRow(currentRow);
    ws.mergeCells(`A${currentRow}:D${currentRow}`);
    totalRow.getCell(1).value = "TOTAL GERAL";
    totalRow.getCell(1).font = { bold: true, size: 11, name: "Arial", color: { argb: "FFFFFF" } };
    totalRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TORG_BLUE } };
    totalRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

    // Soma de todos subtotais de peso
    const subtotalPesoRefs = [];
    const subtotalValorRefs = [];
    let scanRow = 10;
    for (const secao of SECOES) {
      scanRow++; // header secao
      scanRow++; // header colunas
      scanRow += secao.linhas; // linhas de dados
      subtotalPesoRefs.push(`E${scanRow}`);
      subtotalValorRefs.push(`G${scanRow}`);
      scanRow += 2; // subtotal + espaco
    }

    totalRow.getCell(5).value = { formula: subtotalPesoRefs.join("+") };
    totalRow.getCell(5).numFmt = '#,##0.00';
    totalRow.getCell(5).font = { bold: true, size: 11, name: "Arial", color: { argb: "FFFFFF" } };
    totalRow.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TORG_BLUE } };

    totalRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TORG_BLUE } };

    totalRow.getCell(7).value = { formula: subtotalValorRefs.join("+") };
    totalRow.getCell(7).numFmt = '#,##0.00';
    totalRow.getCell(7).font = { bold: true, size: 11, name: "Arial", color: { argb: "FFFFFF" } };
    totalRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TORG_BLUE } };

    for (let col = 1; col <= 7; col++) {
      totalRow.getCell(col).border = THIN_BORDER;
    }
    totalRow.height = 26;

    // Proteger a aba (permite editar apenas colunas B, C, F)
    ws.protect("torg2024", {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
    });
    // Desbloquear celulas editaveis
    for (let r = 1; r <= currentRow; r++) {
      const row = ws.getRow(r);
      // Campos do cabecalho
      if (r >= 4 && r <= 6) {
        row.getCell(2).protection = { locked: false };
        row.getCell(7).protection = { locked: false };
      }
    }
    // Desbloquear colunas B (produto), C (area), F (valor unit) nas linhas de dados
    let unlockRow = 10;
    for (const secao of SECOES) {
      unlockRow += 2; // header + col header
      for (let i = 0; i < secao.linhas; i++) {
        ws.getRow(unlockRow).getCell(2).protection = { locked: false }; // produto
        ws.getRow(unlockRow).getCell(3).protection = { locked: false }; // area
        ws.getRow(unlockRow).getCell(6).protection = { locked: false }; // valor unit
        unlockRow++;
      }
      unlockRow += 2; // subtotal + espaco
    }

    // ══════════════════════════════════════
    // ABA 2: Banco de Dados
    // ══════════════════════════════════════
    const wsDB = wb.addWorksheet("Banco de Dados");

    wsDB.columns = [
      { key: "categoria", width: 28 },
      { key: "produto", width: 48 },
      { key: "peso_m2", width: 14 },
      { key: "espessura", width: 14 },
      { key: "fator", width: 14 },
      { key: "observacao", width: 50 },
    ];

    // Titulo
    wsDB.mergeCells("A1:F1");
    wsDB.getCell("A1").value = "TORG METAL — Banco de Dados de Materiais";
    wsDB.getCell("A1").font = { bold: true, size: 12, name: "Arial", color: { argb: TORG_DARK } };
    wsDB.getRow(1).height = 26;

    wsDB.mergeCells("A2:F2");
    wsDB.getCell("A2").value = "Pesos teoricos de referencia (kg/m²). Confirme com o catalogo/fornecedor antes de fechar a proposta.";
    wsDB.getCell("A2").font = { italic: true, size: 9, name: "Arial", color: { argb: "666666" } };

    // Header
    const dbHeaders = ["CATEGORIA", "PRODUTO", "Peso (kg/m²)", "Espess. (mm)", "Fator/Dens.", "Observacao"];
    const dbHeaderRow = wsDB.getRow(3);
    dbHeaders.forEach((h, i) => {
      const cell = dbHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: "center" };
    });
    dbHeaderRow.height = 22;

    // Dados agrupados por categoria
    let dbRow = 4;
    let lastCat = "";
    for (const prod of CATALOGO_ACESSORIOS) {
      const catLabel = CATEGORIAS_CATALOGO.find((c) => c.value === prod.categoria)?.label || prod.categoria;
      const row = wsDB.getRow(dbRow);

      if (prod.categoria !== lastCat) {
        row.getCell(1).value = catLabel.toUpperCase();
        row.getCell(1).font = { bold: true, size: 10, name: "Arial", color: { argb: TORG_DARK } };
        lastCat = prod.categoria;
      }

      row.getCell(2).value = prod.nome;
      row.getCell(2).font = CELL_FONT;
      row.getCell(3).value = prod.pesoM2;
      row.getCell(3).numFmt = '#,##0.00';
      row.getCell(3).font = CELL_FONT;
      row.getCell(4).value = prod.espessuraMm || "";
      row.getCell(4).font = CELL_FONT;
      row.getCell(5).value = prod.fatorDesenvolvimento || "";
      row.getCell(5).font = CELL_FONT;
      row.getCell(6).value = prod.observacao || "";
      row.getCell(6).font = { size: 9, name: "Arial", color: { argb: "666666" } };

      for (let col = 1; col <= 6; col++) {
        row.getCell(col).border = THIN_BORDER;
      }

      dbRow++;
    }

    // Proteger aba de banco de dados
    wsDB.protect("torg2024", { selectLockedCells: true, selectUnlockedCells: true });

    // Gerar buffer
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=TORG_Composicao_de_Areas.xlsx",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
