// As fontes do Packing List da Valmet na pasta da obra (Vitor, 16/10/2026: "precisa acessar a pasta da obra e verificar
// as informações e preencher todas as informações"). Os textos abaixo são trechos do que o unpdf extrai dos PDFs reais
// da OP-094 (OC 401541 rev1 e Instrução de Faturamento J5A199).
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { lerOcValmet, lerInstrucaoValmet, lerEquivalenciaValmet, revisaoValmet, maisRecente } from "@/lib/packing-valmet-fontes";

const OC = `Responsável
OCTAVIO AUGUSTO TANAKA DE CARVALHO
ORDEM DE COMPRA
712420
No Página351/401541 / 20
Posição e item QT Prazo de entrega Preço unitário Total da linhaMoedaUn
1 ISL007000 1 416.047,09416.047,0910.08.2026GB BRL
Estrutura Metálica LF
Projeto J5A199 LF
Elemento 3101001 LF`;

const INSTRUCAO = `UNIDADE: 351-Lençóis Paulista INCOTERM: CIF - INDUSTRIALIZADOR
PROJETO: J5A199 TRANSPORTADORA: À DEFINIR NO EMBARQUE
CLIENTE: BRACELL SP CELULOSE LTD CONTATO/TELEFONE: -
Contato na Obra: Marcos Bueno, Leonardo Calimann Telefone: (42) 99126-6799
DADOS NF VENDA DADOS NF REMESSA
Valmet Celulose Papel e Energia Ltda.
CNPJ: 43.443.043/0014-79
Inscr. Estadual: 416.139.897.110
Endereço: Rodovia Juliano Lorenzetti, KM 4
Bairro: Distrito Industrial II
Cidade: Lençóis Paulista - SP
CEP: 18685-900`;

describe("OC da Valmet", () => {
  it("Order Txt = companhia/OC, o projeto e o item (posição + código do material)", () => {
    expect(lerOcValmet(OC)).toEqual({ orderTxt: "351/401541", projeto: "J5A199", itens: [{ posicao: 1, codigo: "ISL007000" }] });
  });
  it("texto que não é OC não inventa nada", () => {
    expect(lerOcValmet("qualquer coisa")).toEqual({ orderTxt: null, projeto: null, itens: [] });
  });
});

describe("Instrução de Faturamento", () => {
  it("comprador (dados da NF de venda) e o contato na obra — o primeiro nome da lista", () => {
    expect(lerInstrucaoValmet(INSTRUCAO)).toEqual({
      projeto: "J5A199", cliente: "BRACELL SP CELULOSE LTD",
      comprador: { razao: "Valmet Celulose Papel e Energia Ltda.", cnpj: "43.443.043/0014-79", cep: "18685-900", endereco: "Rodovia Juliano Lorenzetti, KM 4", cidadeUf: "Lençóis Paulista - SP" },
      contato: "Marcos Bueno", telefone: "(42) 99126-6799",
    });
  });
});

describe("revisão do arquivo", () => {
  // ⚠ o revisaoDoArquivo da TMSA (\bR(\d+)\b) não vê "_R01": o sublinhado é caractere de palavra e mata a fronteira
  it("_R01, -R1, rev1 e sem revisão", () => {
    expect(revisaoValmet("T94-LISTA DE EQUIVALÊNCIA TORG_VALMET_R01.xlsx")).toBe(1);
    expect(revisaoValmet("MF01219515-R1.pdf")).toBe(1);
    expect(revisaoValmet("OC 401541 rev1.PDF")).toBe(1);
    expect(revisaoValmet("OC 401541 RC 201785.PDF")).toBe(0);
  });
  it("maisRecente escolhe a maior revisão entre os que casam", () => {
    const arqs = [{ name: "T94-LISTA DE EQUIVALÊNCIA TORG_VALMET_R00.xlsx" }, { name: "T94-LISTA DE EQUIVALÊNCIA TORG_VALMET_R02.xlsx" }, { name: "T94-LE_R05.xlsx" }];
    expect(maisRecente(arqs, /equival/i).name).toMatch(/_R02/);
    expect(maisRecente([], /equival/i)).toBeNull();
  });
});

async function planilhaEquivalencia() {
  const wb = new ExcelJS.Workbook();
  for (const [aba, linhas] of [["T94-PM-01_R00", [["T94A1", "MF01219515", "3311.M.ESM.0163", "T94-PM-01_R00", 1], ["T94DG1", "MF01219515", "3311.M.ESM.0163", "T94-PM-01_R00", 0]]], ["T94-PM-06_R00", [["T94G40", "MF01219234", "3311.M.ESM.0168", "T94-PM-06_R00", 0], ["T94DG1", "MF01219234", "3311.M.ESM.0168", "T94-PM-06_R00", 0]]]]) {
    const ws = wb.addWorksheet(aba);
    ws.getCell("A6").value = " CLIENTE:";
    ["ITEM", "MARCA", "QTD.", "DESCRIÇÃO", "REV.", "DESENHO TORG", "DESENHO VALMET", "DESENHO BRACELL"].forEach((t, i) => { ws.getCell(9, i + 1).value = `  ${t}  `; });
    linhas.forEach(([marca, valmet, bracell, torg, rev], i) => { ws.getRow(12 + i).values = [i + 1, marca, 1, "  PEÇA  ", rev, torg, valmet, bracell]; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("Lista de Equivalência Torg × Valmet", () => {
  it("lê TODAS as abas (uma por desenho de montagem), pela linha de cabeçalho", async () => {
    const eq = await lerEquivalenciaValmet(await planilhaEquivalencia());
    expect(eq.get("T94A1")).toEqual({ valmet: "MF01219515", bracell: "3311.M.ESM.0163", torg: "T94-PM-01_R00", rev: "1" });
    expect(eq.get("T94G40").valmet).toBe("MF01219234");
  });
  it("marca em dois desenhos de montagem: fica a primeira — e a chave ignora caixa e espaço", async () => {
    const eq = await lerEquivalenciaValmet(await planilhaEquivalencia());
    expect(eq.get("T94DG1").valmet).toBe("MF01219515");
    expect(eq.size).toBe(3);
  });
});
