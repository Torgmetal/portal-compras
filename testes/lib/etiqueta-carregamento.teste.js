import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { gerarEtiquetasCarregamentoPDF, ajustarTexto, numeroDaEtiqueta, contagemDaEtiqueta, GRADE, MM } from "@/lib/etiqueta-carregamento-pdf";

// ⚠ POR QUE ESTE TESTE EXISTE, E NÃO UMA OLHADA NA TELA.
//
// A etiqueta é desenhada por coordenada. Conferi a primeira versão renderizando o PDF e olhando:
// "parece que a marca longa vaza a célula". Não vazava — o visualizador dava zoom diferente quando
// o PDF tinha uma página só. Perdi tempo consertando o que não estava quebrado, e o que ESTAVA
// (a marca sob o QR, essa sim sem ajuste nenhum) não aparecia no olho.
//
// Pixel não prova geometria. Aqui a pergunta é numérica: o texto termina antes da moldura?

async function fontes() {
  const pdf = await PDFDocument.create();
  return { bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
}

const MARCA_LONGA = "T89-CONJUNTO-LONGO-999-XYZ";
const DESC_LONGA = "COLUNA COM CHAPA DE BASE, ENRIJECEDORES E CHUMBADORES";

describe("ajustarTexto — nada pode vazar a célula", () => {
  it("encolhe até caber e devolve onde o texto termina", async () => {
    const { bold } = await fontes();
    const r = ajustarTexto(MARCA_LONGA, bold, { xIni: 38, xFim: 97.3, tamMax: 15 });
    expect(r.tam).toBeLessThan(15);
    expect(r.xFim).toBeLessThanOrEqual(97.3);
  });

  it("texto curto fica no tamanho máximo — encolher sem precisar seria pior de ler", async () => {
    const { bold } = await fontes();
    expect(ajustarTexto("T89C20", bold, { xIni: 38, xFim: 97.3, tamMax: 15 }).tam).toBe(15);
  });

  it("quando encolher não basta, corta com reticência em vez de vazar", async () => {
    const { bold } = await fontes();
    const r = ajustarTexto("X".repeat(400), bold, { xIni: 38, xFim: 97.3, tamMax: 15, tamMin: 4 });
    expect(r.tam).toBe(4);
    expect(r.texto.endsWith("…")).toBe(true);
    expect(r.xFim).toBeLessThanOrEqual(97.3);
  });

  it("string vazia não quebra", async () => {
    const { bold } = await fontes();
    expect(ajustarTexto("", bold, { xIni: 38, xFim: 97.3, tamMax: 15 }).tam).toBe(15);
  });

  // As três células de texto variável, medidas com os MESMOS limites que o desenho usa.
  it.each([
    ["TAG", GRADE.colQtde + 11, GRADE.fimDir - 1.5, 15, MARCA_LONGA],
    ["marca sob o QR", GRADE.colDir + 1, GRADE.fimDir - 1, 6, MARCA_LONGA],
    ["DESCRIÇÃO", GRADE.colQtde + 1.5, GRADE.fimDir - 1.5, 8, DESC_LONGA],
  ])("célula %s segura o texto longo dentro da moldura", async (_nome, xIni, xFim, tamMax, texto) => {
    const { bold } = await fontes();
    const r = ajustarTexto(texto, bold, { xIni, xFim, tamMax });
    expect(r.xFim).toBeLessThanOrEqual(xFim);
    expect(r.xFim).toBeLessThanOrEqual(GRADE.fimDir);
  });
});

describe("numeroDaEtiqueta — o T é convenção da etiqueta, não do banco", () => {
  it.each([
    ["121", "T121"],
    ["089", "T089"],
    ["036-01", "T036-01"],
    ["T89", "T89"],      // já veio com T: não dobra
    ["t89", "T89"],      // minúsculo do cadastro vira maiúsculo
  ])("%s vira %s", (entrada, esperado) => {
    expect(numeroDaEtiqueta(entrada)).toBe(esperado);
  });

  it("vazio não vira um T sozinho", () => {
    expect(numeroDaEtiqueta("")).toBe("—");
    expect(numeroDaEtiqueta(null)).toBe("—");
  });
});

describe("contagemDaEtiqueta — sem zero à esquerda", () => {
  // ⚠ Matheus (08/09/2026): "remova esses 0 à esquerda". O "001/1" era exigência do BarTender,
  // que importava a planilha com o campo de largura fixa.
  it.each([
    [1, 1, "1/1"],
    [3, 3, "3/3"],
    [7, 12, "7/12"],
    [300, 300, "300/300"],
    [1, 1000, "1/1000"],
  ])("%s de %s vira %s", (i, n, esperado) => {
    expect(contagemDaEtiqueta(i, n)).toBe(esperado);
  });

  it("nenhum resultado começa com zero", () => {
    for (let i = 1; i <= 20; i++) expect(contagemDaEtiqueta(i, 20).startsWith("0")).toBe(false);
  });
});

describe("a grade cabe na etiqueta de 100×50", () => {
  it("nada da grade passa dos limites do rolo", () => {
    expect(GRADE.fimDir).toBeLessThan(100);
    expect(GRADE.fim).toBeLessThan(50);
    expect(GRADE.colQtde).toBeLessThan(GRADE.colDir);
    expect(GRADE.colDir).toBeLessThan(GRADE.fimDir);
  });

  it("as linhas horizontais estão em ordem, de cima para baixo", () => {
    const ordem = [GRADE.borda, GRADE.yOP, GRADE.yCabecalho, GRADE.yCliente, GRADE.yObra, GRADE.yTag, GRADE.fim];
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });
});

describe("gerarEtiquetasCarregamentoPDF", () => {
  const base = { cliente: "TMSA", obra: "TPR763 - TERMASA - EL - 303", opNumero: "T89" };

  it("a página tem exatamente 100×50 mm — é o rolo que está na máquina", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, pecas: [{ marca: "T89C20", descricao: "Treliça", qte: 1, pesoUnitKg: 94.65 }],
    });
    const pdf = await PDFDocument.load(bytes);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width / MM).toBeCloseTo(100, 5);
    expect(height / MM).toBeCloseTo(50, 5);
  });

  // ⚠ UMA ETIQUETA POR PEÇA, não por marca. É o "001/1" da etiqueta em uso: quem confere o
  // carregamento precisa saber se falta uma das cinco.
  it("uma marca com 5 peças gera 5 etiquetas", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, pecas: [{ marca: "T89C21", descricao: "Viga", qte: 5, pesoUnitKg: 12 }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
  });

  it("soma as quantidades de várias marcas", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base,
      pecas: [{ marca: "A", qte: 2 }, { marca: "B", qte: 3 }, { marca: "C", qte: 1 }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(6);
  });

  it("quantidade ausente ou zerada ainda rende uma etiqueta", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, pecas: [{ marca: "SEM-QTE" }, { marca: "ZERO", qte: 0 }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it("aguenta acento, obra vazia e peso nulo sem explodir", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      cliente: "AÇOS SÃO JOÃO", obra: null, opNumero: "T90",
      pecas: [{ marca: "T90C1", descricao: "Treliça de cobertura", qte: 1, pesoUnitKg: null }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
