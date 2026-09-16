// Os arquivos de verdade: o PDF e a planilha saem com bytes válidos e com o que interessa dentro.
//
// ⚠⚠ POR QUE GERAR DE VERDADE EM VEZ DE MOCKAR: um relatório que "monta" mas sai com zero página,
// ou com a tabela vazia, passa em qualquer teste de chamada. E este documento vai junto com o
// romaneio — se ele sair errado, sai errado na frente do cliente.
import { describe, it, expect, vi } from "vitest";
import { montarRelatorio } from "@/lib/conferencia-relatorio";

vi.mock("@/lib/sgq-forms", () => ({ refFORM: () => "FORM 22 Rev.0" }));

const rel = montarRelatorio({
  sessao: { id: "c1", status: "FINALIZADA", observacao: "carga da manhã",
    iniciadaEm: "2026-09-16T11:00:00Z", iniciadaPorNome: "Leandro Guimarães",
    finalizadaEm: "2026-09-16T14:30:00Z", finalizadaPorNome: "Leandro Guimarães" },
  op: { numero: "103", cliente: "TMSA", obra: "Torocuá — Ñacunday" },
  marcas: [
    { marca: "T103A1", descricao: "VIGA PRINCIPAL", previsto: 4, conferido: 4, saldo: 0 },
    { marca: "T103A2", descricao: "COLUNA", previsto: 2, conferido: 1, saldo: 1 },
    { marca: "T103A3", descricao: "TERÇA GALVANIZADA", previsto: 6, conferido: 0, saldo: 6 },
  ],
  lancamentos: [
    { id: "l2", marca: "T103A2", qte: 1, criadoEm: "2026-09-16T13:00:00Z", criadoPorNome: "Leandro", observacao: "chegou amassada" },
    { id: "l1", marca: "T103A1", qte: 4, criadoEm: "2026-09-16T12:00:00Z", criadoPorNome: "Leandro", observacao: "" },
  ],
});

describe("PDF da conferência", () => {
  it("sai um PDF de verdade, com página", async () => {
    const { gerarConferenciaPDF } = await import("@/lib/conferencia-peca-pdf");
    const buf = await gerarConferenciaPDF(rel);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);

    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  // ⚠ Acento fora da tabela WinAnsi derruba o `drawText` e leva o documento inteiro junto. A obra
  // de teste tem "Ñ" e "á" de propósito.
  it("marca e obra com acento não derrubam a geração", async () => {
    const { gerarConferenciaPDF } = await import("@/lib/conferencia-peca-pdf");
    const comAcento = montarRelatorio({
      sessao: { status: "FINALIZADA" },
      op: { numero: "89", cliente: "DANPOWER", obra: "São Gonçalo — Ñ" },
      marcas: [{ marca: "T89Ç1", descricao: "PEÇA COM AÇO INOX — 3/4\"", previsto: 1, conferido: 1, saldo: 0 }],
      lancamentos: [],
    });
    const buf = await gerarConferenciaPDF(comAcento);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("conferência sem lançamento nenhum ainda vira documento", async () => {
    const { gerarConferenciaPDF } = await import("@/lib/conferencia-peca-pdf");
    const vazia = montarRelatorio({ sessao: { status: "ABERTA" }, op: { numero: "1" }, marcas: [], lancamentos: [] });
    const buf = await gerarConferenciaPDF(vazia);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  // ⚠ 500 marcas é obra real (a OP-97 tem 537): o documento tem de paginar, não estourar a folha.
  it("obra grande pagina em vez de escrever fora da folha", async () => {
    const { gerarConferenciaPDF } = await import("@/lib/conferencia-peca-pdf");
    const marcas = Array.from({ length: 500 }, (_, i) => ({
      marca: `T97A${i + 1}`, descricao: "PECA", previsto: 2, conferido: i % 3 === 0 ? 2 : 0, saldo: i % 3 === 0 ? 0 : 2,
    }));
    const { PDFDocument } = await import("pdf-lib");
    const buf = await gerarConferenciaPDF(montarRelatorio({ sessao: {}, op: { numero: "97" }, marcas, lancamentos: [] }));
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBeGreaterThan(5);
  });
});

// ⚠⚠ ESTE TESTE NASCEU DE UM DEFEITO QUE SÓ O PDF GERADO MOSTROU: com a coluna de situação em
// 50 pt, "Não conferida" — o rótulo que o documento existe para destacar — saía "Não conf...".
// Largura de coluna some em silêncio; a conta tem de ser refeita por alguém.
describe("a grade do PDF cabe na folha", () => {
  it("as colunas somam a largura útil, sem estourar nem sobrar", async () => {
    const { COLS, COLS_HISTORICO, LARGURA_UTIL } = await import("@/lib/conferencia-peca-pdf");
    for (const grade of [COLS, COLS_HISTORICO]) {
      const soma = grade.reduce((t, c) => t + c.w, 0);
      expect(soma).toBeLessThanOrEqual(LARGURA_UTIL);
      expect(soma).toBeGreaterThan(LARGURA_UTIL - 2);
    }
  });

  it("o rótulo mais longo de situação cabe inteiro na coluna", async () => {
    const { COLS } = await import("@/lib/conferencia-peca-pdf");
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const coluna = COLS.find((c) => c.t === "Situacao");
    for (const rotulo of ["Não conferida", "Conferida", "Parcial"]) {
      expect(bold.widthOfTextAtSize(rotulo, 7.5)).toBeLessThanOrEqual(coluna.w - 8);
    }
  });
});

describe("Excel da conferência", () => {
  it("sai um xlsx de verdade, com as duas abas", async () => {
    const { gerarConferenciaExcel } = await import("@/lib/conferencia-peca-excel");
    const buf = await gerarConferenciaExcel(rel);
    // xlsx é um zip: começa com "PK"
    expect(buf.subarray(0, 2).toString()).toBe("PK");

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Peças", "Lançamentos"]);
  });

  // ⚠⚠ O QUE FALTA TEM DE ESTAR ESCRITO. Um relatório que só celebra o conferido certifica um
  // carregamento que não aconteceu — é a razão de o documento existir do jeito que existe.
  it("a planilha diz o que faltou, não só o que passou", async () => {
    const { gerarConferenciaExcel } = await import("@/lib/conferencia-peca-excel");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await gerarConferenciaExcel(rel));
    const texto = JSON.stringify(wb.getWorksheet("Peças").getSheetValues());
    expect(texto).toContain("T103A3");          // a marca que ninguém conferiu
    expect(texto).toContain("Não conferida");
    expect(texto).toContain("Parcial");
    expect(JSON.stringify(wb.worksheets[0].getSheetValues())).toMatch(/ATEN[ÇC][ÃA]O/);
  });

  it("o histórico traz quem contou, quando e a observação", async () => {
    const { gerarConferenciaExcel } = await import("@/lib/conferencia-peca-excel");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await gerarConferenciaExcel(rel));
    const texto = JSON.stringify(wb.getWorksheet("Lançamentos").getSheetValues());
    expect(texto).toContain("chegou amassada");
    expect(texto).toContain("Leandro");
  });
});
