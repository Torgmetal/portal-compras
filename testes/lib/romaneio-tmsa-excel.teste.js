// O FOR-081 preenchido no PRÓPRIO modelo da TMSA (Vitor, 15/10/2026: "devemos seguir exatamente esse mesmo modelo, não
// podemos mudar nada"). Ida e volta: gera, lê de volta e confere célula a célula — e que o layout continua o do modelo.
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { gerarRomaneioTmsaExcel } from "@/lib/romaneio-tmsa-excel";

const base = {
  numero: 3, data: new Date("2026-10-15T15:00:00Z"), referencia: "TPR00751 / OP-122", observacoes: "Carga 1 de 2",
  totais: { kgLiquido: 1234.5, kgBruto: 1290.2, embalagens: 2 },
  embalagens: [
    { numero: 1, tipo: "VOLUME 1", dims: [620, 110, 45], kgLiquido: 900, kgBruto: 940.5, linhas: [
      { tag: "TC 4706", qtd: 2, codigo: "231297-1", descricao: "COLUNA — 105A3" },
      { tag: "TC 4707", qtd: 1, codigo: "231300-2", descricao: "COLUNA — 105A3" },
    ] },
    { numero: 2, tipo: "VOLUME 2", dims: null, kgLiquido: 334.5, kgBruto: 349.7, linhas: [{ tag: null, qtd: 4, codigo: null, descricao: "VIGA — 105B1" }] },
  ],
};
async function ler(buf) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb; }

describe("FOR-081 preenchido", () => {
  it("cabeçalho: número, Torg no campo livre, data, totais, referência, observações", async () => {
    const ws = (await ler(await gerarRomaneioTmsaExcel(base))).worksheets[0];
    expect(String(ws.getCell("A1").value)).toBe("ROMANEIO Nº 3");
    expect(String(ws.getCell("I1").value)).toMatch(/TORG METAL LTDA.*53\.694\.442\/0001-41/);
    expect(String(ws.getCell("I3").value)).toMatch(/Conchal\/SP/);
    expect(String(ws.getCell("I4").value)).toMatch(/3500-8293/);
    expect(String(ws.getCell("I2").value)).toBe("Data do embarque: 15/10/2026");
    expect(ws.getCell("M2").value).toBe(1234.5);
    expect(ws.getCell("M5").value).toBe(1290.2);
    expect(ws.getCell("N2").value).toBe("TPR00751 / OP-122");
    expect(ws.getCell("N5").value).toBe(2);
    expect(ws.getCell("C5").value).toBe("Carga 1 de 2");
  });
  it("embalagem com duas TAGs ocupa duas linhas, com os dados do volume mesclados na vertical", async () => {
    const ws = (await ler(await gerarRomaneioTmsaExcel(base))).worksheets[0];
    expect([1, "VOLUME 1", 620, "x", 110, "x", 45, 900, 940.5].map((v, i) => [v, ws.getCell(9, i + 1).value])).toEqual([1, "VOLUME 1", 620, "x", 110, "x", 45, 900, 940.5].map((v) => [v, v]));
    expect(["J9", "K9", "L9", "M9"].map((a) => ws.getCell(a).value)).toEqual(["TC 4706", 2, "231297-1", "COLUNA — 105A3"]);
    expect(["J10", "K10", "L10", "M10"].map((a) => ws.getCell(a).value)).toEqual(["TC 4707", 1, "231300-2", "COLUNA — 105A3"]);
    expect(ws.getCell("A10").master.address).toBe("A9");
    expect(ws.getCell("I10").master.address).toBe("I9");
    expect(ws.getCell("A11").value).toBe(2);
    expect(ws.getCell("C11").value).toBe(null); // sem medida da simulação: em branco, nunca zero
  });
  it("mais linhas que o modelo: cria linhas iguais às dele e estende a área de impressão", async () => {
    const muitas = { ...base, embalagens: Array.from({ length: 20 }, (_, i) => ({ numero: i + 1, tipo: `VOLUME ${i + 1}`, dims: [100, 50, 40], kgLiquido: 10, kgBruto: 12, linhas: [{ tag: "TC 1", qtd: 1, codigo: "X", descricao: `P — M${i}` }] })) };
    const ws = (await ler(await gerarRomaneioTmsaExcel(muitas))).worksheets[0];
    expect(ws.getCell("A28").value).toBe(20);
    expect(ws.getCell("M28").master.address).toBe("M28");
    expect(ws.getCell("O28").master.address).toBe("M28");
    expect(ws.getRow(28).height).toBe(ws.getRow(9).height);
    expect(ws.pageSetup.printArea).toBe("A1:O28");
  });
  it("o layout do modelo fica: logo, larguras, A4 paisagem e títulos repetidos", async () => {
    const wb = await ler(await gerarRomaneioTmsaExcel(base));
    const ws = wb.worksheets[0];
    expect(ws.getImages()).toHaveLength(1);
    expect(ws.getColumn("M").width).toBeCloseTo(40.66, 1);
    expect(ws.pageSetup).toMatchObject({ paperSize: 9, orientation: "landscape", printTitlesRow: "6:8" });
  });
});
