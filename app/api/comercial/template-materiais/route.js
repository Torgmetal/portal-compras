import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { CATALOGO_PERFIS, CATEGORIAS_PERFIL } from "@/lib/catalogo-perfis";
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

export async function GET() {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "TORG Metal — Portal de Compras";
    wb.created = new Date();

    // ══════════════════════════════════════
    // ABA 1: Levantamento de Estrutura
    // ══════════════════════════════════════
    const ws = wb.addWorksheet("Levantamento de Estrutura", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
    });

    ws.columns = [
      { key: "item", width: 6 },
      { key: "material", width: 16 },
      { key: "tipo", width: 20 },
      { key: "perfil", width: 30 },
      { key: "qtde", width: 8 },
      { key: "compr_unit", width: 14 },
      { key: "compr_total", width: 14 },
      { key: "peso_kgm", width: 14 },
      { key: "peso_total", width: 14 },
    ];

    // Titulo
    ws.mergeCells("A1:I1");
    const titleCell = ws.getCell("A1");
    titleCell.value = "LEVANTAMENTO DE ESTRUTURA";
    titleCell.font = { bold: true, size: 14, name: "Arial", color: { argb: TORG_DARK } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 30;

    ws.mergeCells("A2:E2");
    ws.getCell("A2").value = "Sistema de Gestao da Qualidade — Setor: Comercial";
    ws.getCell("A2").font = { size: 9, name: "Arial", color: { argb: "666666" } };
    ws.getCell("H2").value = "Codigo:";
    ws.getCell("H2").font = { size: 9, name: "Arial", bold: true };
    ws.getCell("I2").value = "FOR-00";
    ws.getCell("I2").font = BLUE_FONT;

    // Campos de preenchimento
    const campos = [
      { row: 4, labelA: "Cliente:", labelH: "OP / Prop.:" },
      { row: 5, labelA: "Obra / Projeto:", labelH: "Responsavel:" },
      { row: 6, labelA: "Elaborado por:", labelH: "Data:" },
    ];
    for (const c of campos) {
      ws.getCell(`A${c.row}`).value = c.labelA;
      ws.getCell(`A${c.row}`).font = { bold: true, size: 10, name: "Arial" };
      ws.getCell(`B${c.row}`).font = BLUE_FONT;
      ws.getCell(`B${c.row}`).border = { bottom: { style: "thin", color: { argb: TORG_BLUE } } };
      ws.mergeCells(`B${c.row}:G${c.row}`);
      ws.getCell(`H${c.row}`).value = c.labelH;
      ws.getCell(`H${c.row}`).font = { bold: true, size: 10, name: "Arial" };
      ws.getCell(`I${c.row}`).font = BLUE_FONT;
      ws.getCell(`I${c.row}`).border = { bottom: { style: "thin", color: { argb: TORG_BLUE } } };
    }

    // Instrucoes
    ws.mergeCells("A8:I8");
    ws.getCell("A8").value = "Selecione o Perfil/Bitola na lista (da aba Banco de Dados). Peso (kg/m) e automatico via VLOOKUP. Informe Qtde e Comprimento unit.";
    ws.getCell("A8").font = { italic: true, size: 9, name: "Arial", color: { argb: "666666" } };
    ws.getRow(8).height = 20;

    // Header de colunas (linha 10)
    const headerRowIdx = 10;
    const colHeaders = [
      "Item",
      "Material / Norma",
      "Tipo",
      "Perfil / Bitola\n(selecione na lista)",
      "Qtde",
      "Compr. Unit.\n(m)",
      "Compr. Total\n(m)",
      "Peso\n(kg/m)",
      "Peso Total\n(kg)",
    ];
    const headerRow = ws.getRow(headerRowIdx);
    colHeaders.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = THIN_BORDER;
    });
    headerRow.height = 32;

    // Lista de todos os perfis para dropdown (col D)
    const todosPerfis = CATALOGO_PERFIS.map((p) => p.perfil);

    // Tipos para dropdown (col C) — labels das categorias
    const tiposDropdown = CATEGORIAS_PERFIL.map((c) => c.label);

    // Normas comuns para dropdown (col B)
    const normasDropdown = ["A572 Gr50", "A36", "ASTM A500", "SAE 1020", "SAE 1045", "CIVIL", "NBR 7007-AR350", "NBR 7007-MR250"];

    const NUM_LINHAS = 50;
    const firstDataRow = headerRowIdx + 1;

    for (let i = 0; i < NUM_LINHAS; i++) {
      const r = firstDataRow + i;
      const row = ws.getRow(r);

      // Col A: numero do item
      row.getCell(1).value = i + 1;
      row.getCell(1).font = CELL_FONT;
      row.getCell(1).alignment = { horizontal: "center" };

      // Col B: Material/Norma (dropdown)
      const matCell = row.getCell(2);
      matCell.font = BLUE_FONT;
      matCell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${normasDropdown.join(",")}"`],
        showErrorMessage: false,
      };

      // Col C: Tipo (dropdown)
      const tipoCell = row.getCell(3);
      tipoCell.font = BLUE_FONT;
      tipoCell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${tiposDropdown.join(",")}"`],
        showErrorMessage: false,
      };

      // Col D: Perfil/Bitola (dropdown — referencia banco de dados)
      const perfilCell = row.getCell(4);
      perfilCell.font = BLUE_FONT;
      // ExcelJS nao suporta dropdown > 255 chars inline, entao referenciar a aba de banco de dados
      perfilCell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'Banco de Dados'!$B$4:$B$${3 + todosPerfis.length}`],
        showErrorMessage: true,
        errorTitle: "Perfil invalido",
        error: "Selecione um perfil da lista ou digite manualmente",
      };

      // Col E: Quantidade (input)
      row.getCell(5).font = BLUE_FONT;
      row.getCell(5).numFmt = "#,##0";
      row.getCell(5).alignment = { horizontal: "right" };

      // Col F: Comprimento unitario (input)
      row.getCell(6).font = BLUE_FONT;
      row.getCell(6).numFmt = "#,##0.000";
      row.getCell(6).alignment = { horizontal: "right" };

      // Col G: Comprimento total = Qtde * Compr unit (formula)
      const compTotalCell = row.getCell(7);
      compTotalCell.value = { formula: `IF(OR(E${r}="",F${r}=""),0,E${r}*F${r})` };
      compTotalCell.numFmt = "#,##0.000";
      compTotalCell.font = CELL_FONT;
      compTotalCell.alignment = { horizontal: "right" };

      // Col H: Peso kg/m (VLOOKUP do Banco de Dados)
      const pesoCell = row.getCell(8);
      pesoCell.value = { formula: `IF(D${r}="","",VLOOKUP(D${r},'Banco de Dados'!B:C,2,FALSE))` };
      pesoCell.numFmt = "#,##0.00";
      pesoCell.font = CELL_FONT;
      pesoCell.alignment = { horizontal: "right" };

      // Col I: Peso Total = Compr total * Peso kg/m (formula)
      const pesoTotalCell = row.getCell(9);
      pesoTotalCell.value = { formula: `IF(OR(G${r}=0,H${r}=""),0,G${r}*H${r})` };
      pesoTotalCell.numFmt = "#,##0.00";
      pesoTotalCell.font = CELL_FONT;
      pesoTotalCell.alignment = { horizontal: "right" };

      // Bordas
      for (let col = 1; col <= 9; col++) {
        row.getCell(col).border = THIN_BORDER;
      }
    }

    // Linha de TOTAL
    const totalRowIdx = firstDataRow + NUM_LINHAS;
    const totalRow = ws.getRow(totalRowIdx);
    ws.mergeCells(`A${totalRowIdx}:F${totalRowIdx}`);
    totalRow.getCell(1).value = "TOTAL GERAL";
    totalRow.getCell(1).font = { bold: true, size: 11, name: "Arial", color: { argb: "FFFFFF" } };
    totalRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TORG_BLUE } };
    totalRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

    // Compr total
    totalRow.getCell(7).value = { formula: `SUM(G${firstDataRow}:G${totalRowIdx - 1})` };
    totalRow.getCell(7).numFmt = "#,##0.000";
    totalRow.getCell(7).font = { bold: true, size: 11, name: "Arial", color: { argb: "FFFFFF" } };
    totalRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TORG_BLUE } };

    // Peso total
    totalRow.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TORG_BLUE } };

    totalRow.getCell(9).value = { formula: `SUM(I${firstDataRow}:I${totalRowIdx - 1})` };
    totalRow.getCell(9).numFmt = "#,##0.00";
    totalRow.getCell(9).font = { bold: true, size: 11, name: "Arial", color: { argb: "FFFFFF" } };
    totalRow.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TORG_BLUE } };

    for (let col = 1; col <= 9; col++) {
      totalRow.getCell(col).border = THIN_BORDER;
    }
    totalRow.height = 26;

    // Proteger aba (permite editar colunas B, C, D, E, F)
    ws.protect("torg2024", {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
    });
    // Desbloquear campos do cabecalho
    for (let r = 4; r <= 6; r++) {
      ws.getRow(r).getCell(2).protection = { locked: false };
      ws.getRow(r).getCell(9).protection = { locked: false };
    }
    // Desbloquear colunas editaveis nas linhas de dados
    for (let i = 0; i < NUM_LINHAS; i++) {
      const r = firstDataRow + i;
      ws.getRow(r).getCell(2).protection = { locked: false }; // Material
      ws.getRow(r).getCell(3).protection = { locked: false }; // Tipo
      ws.getRow(r).getCell(4).protection = { locked: false }; // Perfil
      ws.getRow(r).getCell(5).protection = { locked: false }; // Qtde
      ws.getRow(r).getCell(6).protection = { locked: false }; // Compr unit
    }

    // ══════════════════════════════════════
    // ABA 2: Banco de Dados (Perfis)
    // ══════════════════════════════════════
    const wsDB = wb.addWorksheet("Banco de Dados");

    wsDB.columns = [
      { key: "categoria", width: 22 },
      { key: "perfil", width: 30 },
      { key: "peso_kgm", width: 14 },
    ];

    // Titulo
    wsDB.mergeCells("A1:C1");
    wsDB.getCell("A1").value = "TORG METAL — Banco de Dados de Perfis Estruturais";
    wsDB.getCell("A1").font = { bold: true, size: 12, name: "Arial", color: { argb: TORG_DARK } };
    wsDB.getRow(1).height = 26;

    wsDB.mergeCells("A2:C2");
    wsDB.getCell("A2").value = "Pesos teoricos de referencia (kg/m). Confirme com o catalogo/fornecedor antes de fechar a proposta.";
    wsDB.getCell("A2").font = { italic: true, size: 9, name: "Arial", color: { argb: "666666" } };

    // Header
    const dbHeaders = ["CATEGORIA", "PERFIL", "Peso (kg/m)"];
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
    for (const prod of CATALOGO_PERFIS) {
      const catLabel = CATEGORIAS_PERFIL.find((c) => c.value === prod.categoria)?.label || prod.categoria;
      const row = wsDB.getRow(dbRow);

      if (prod.categoria !== lastCat) {
        row.getCell(1).value = catLabel.toUpperCase();
        row.getCell(1).font = { bold: true, size: 10, name: "Arial", color: { argb: TORG_DARK } };
        lastCat = prod.categoria;
      }

      row.getCell(2).value = prod.perfil;
      row.getCell(2).font = CELL_FONT;
      row.getCell(3).value = prod.pesoKgM;
      row.getCell(3).numFmt = "#,##0.00";
      row.getCell(3).font = CELL_FONT;

      for (let col = 1; col <= 3; col++) {
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
        "Content-Disposition": "attachment; filename=TORG_Levantamento_Estrutura.xlsx",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
