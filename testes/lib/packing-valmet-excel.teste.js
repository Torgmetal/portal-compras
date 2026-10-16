// O Packing List da Valmet preenchido no PRÓPRIO modelo dela — só valores nas células que ele já tem.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { gerarPackingValmetExcel } from "@/lib/packing-valmet-excel";

const base = {
  numero: 3, data: new Date("2026-10-16T12:00:00Z"), obra: "BRACELL", nf: "12345",
  transporte: { transportadora: "IGR", placa: "HRA9731", motorista: "LAZARO / 19 99716-8811" },
  oc: { orderTxt: "351/401541", projeto: "J5A199" },
  instrucao: { comprador: { razao: "Valmet Celulose Papel e Energia Ltda.", cnpj: "43.443.043/0014-79", cep: "18685-900", endereco: "Rodovia Juliano Lorenzetti, KM 4", cidadeUf: "Lençóis Paulista - SP" }, contato: "Marcos Bueno", telefone: "(42) 99126-6799" },
  revisaoEquivalencia: 1,
  totais: { kgLiquido: 648.64, kgBruto: 660.1, m3: 1.348, volumes: 2, dims: null },
  linhas: [
    { item: 1, volume: 1, dims: [780, 40, 35], descricao: "COLUNA", qtd: 1, pesoKg: 591.88, valmetCode: "MF01219515", tag: "T94A1", codigoMaterial: "ISL007000", tipo: "Solta", armazenamento: "S1 Área aberta" },
    { item: 2, volume: 2, dims: null, descricao: "PORCA A563", qtd: 95, pesoKg: 0, valmetCode: null, tag: "T94AC-2", codigoMaterial: "ISL007000", tipo: "Palette", armazenamento: "S2 Área coberta" },
  ],
};

async function abrir(buf) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb.worksheets[0]; }
const v = (ws, c) => { const x = ws.getCell(c).value; return x && typeof x === "object" && !(x instanceof Date) ? (x.formula ? `=${x.formula}` : x.sharedFormula ? `~${x.sharedFormula}` : x) : x; };

describe("gerarPackingValmetExcel", () => {
  it("cabeçalho: projeto, Order Txt, NF, data, nº do embarque, transporte, Torg, comprador e supervisor", async () => {
    const ws = await abrir(await gerarPackingValmetExcel(base));
    expect([v(ws, "B1"), v(ws, "G1"), v(ws, "I1"), v(ws, "M1"), v(ws, "Q1")]).toEqual(["BRACELL", "J5A199", "351/401541", "12345", 3]);
    expect(v(ws, "O1")).toBeInstanceOf(Date);
    expect([v(ws, "B3"), v(ws, "B4"), v(ws, "B5"), v(ws, "B9"), v(ws, "B10"), v(ws, "B11")]).toEqual([660.1, 648.64, 1.348, "IGR", "HRA9731", "LAZARO / 19 99716-8811"]);
    expect(v(ws, "G3")).toBe("TORG METAL LTDA");
    expect(v(ws, "G4")).toBe("53.694.442/0001-41");
    expect([v(ws, "M3"), v(ws, "M4"), v(ws, "M9"), v(ws, "M10"), v(ws, "R4")]).toEqual(["Valmet Celulose Papel e Energia Ltda.", "43.443.043/0014-79", "Marcos Bueno", "(42) 99126-6799", "43.443.043/0014-79"]);
    expect(String(v(ws, "P9"))).toMatch(/Equival.*R01/);
  });

  it("linhas a partir da 13: Order Item = volume, TAG = marca, Valmet Code, Desenho vazio, código do material vazio (Not Use no comentário da Valmet), embalagem", async () => {
    const ws = await abrir(await gerarPackingValmetExcel(base));
    const linha = (r) => "BCDEFGIJLMNOPQR".split("").map((c) => v(ws, `${c}${r}`));
    expect(linha(13)).toEqual([1, 780, 40, 35, 1, "COLUNA", 1, "pç", 591.88, "MF01219515", "T94A1", null, null, "Solta", "S1 Área aberta"]);
    expect(linha(14)).toEqual([2, null, null, null, 2, "PORCA A563", 95, "pç", 0, null, "T94AC-2", null, null, "Palette", "S2 Área coberta"]);
    // ⚠ o Nr. do Pacote é a fórmula do modelo (NF + fornecedor) — decisão do Vitor: não se escreve por cima
    expect(ws.getCell("A13").value).toEqual({ formula: '_xlfn.CONCAT($M$1,"-",$G$3)', result: "12345-TORG METAL LTDA" });
    expect(ws.pageSetup.printArea).toBe("A1:R14");
  });

  it("os comentários da Valmet (nomes de campo) continuam no arquivo", async () => {
    const ws = await abrir(await gerarPackingValmetExcel(base));
    expect(JSON.stringify(ws.getCell("P12").note)).toMatch(/Not Use/);
    expect(JSON.stringify(ws.getCell("M12").note)).toMatch(/Valmet Code/);
  });
});

// O PDF sai do MESMO desenhador do FOR-081 (lib/romaneio-tmsa-pdf.js), lendo da planilha as linhas que repetem (1:12)
describe("PDF do Packing List", () => {
  it("A4 paisagem; com muitas linhas, o cabeçalho (1 a 12) repete em cada página", async () => {
    const { gerarRomaneioTmsaPdf } = await import("@/lib/romaneio-tmsa-pdf");
    const { PDFDocument } = await import("pdf-lib");
    const muitas = Array.from({ length: 60 }, (_, i) => ({ ...base.linhas[0], item: i + 1, tag: `T94A${i + 1}` }));
    const pdf = await PDFDocument.load(await gerarRomaneioTmsaPdf(await gerarPackingValmetExcel({ ...base, linhas: muitas })));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
  });
});
