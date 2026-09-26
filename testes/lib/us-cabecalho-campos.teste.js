// Todo campo do cabeçalho do relatório de ultrassom tem onde o inspetor preencher — e o que ele
// preenche sai no PDF. Vitor (25/09/2026): "nos demais campos da planilha do relatório de US
// precisamos ter como o inspetor preencher essas informações, no campo de desenho e metal de adição
// não está sendo possível preencher (…) tipo de chanfro tbm, todos os campos precisamos deixar para
// ser possível ajustar".
import { describe, it, expect } from "vitest";
import { extractText } from "unpdf";
import { CAMPOS_CABECALHO_US } from "@/lib/us-campos";
import { camposCabecalhoUS } from "@/lib/us-relatorio";
import { gerarUSPDF } from "@/lib/relatorio-us-pdf";

// o que o cabeçalho do PDF imprime, na ordem da folha
const DO_PDF = [
  "desenho", "tag", "local", "tecnica", "procedimento", "norma", "criterio",
  "material", "espessura", "metalAdicao", "processoSolda", "acoplante",
  "tipoJunta", "chanfro", "blocoPadrao",
  "apFabricante", "apModelo", "apSerie",
  "cbFabricante", "cbModelo", "cbAngulo", "cbDimensoes", "cbFrequencia", "cbSerie",
];

describe("o cabeçalho do RUS, campo a campo", () => {
  it("todo campo que o PDF imprime tem onde preencher", () => {
    const temEntrada = new Set(CAMPOS_CABECALHO_US.map((c) => c.k));
    expect(DO_PDF.filter((k) => !temEntrada.has(k))).toEqual([]);
  });

  it("as listas da casa continuam lá, como SUGESTÃO", () => {
    const de = (k) => CAMPOS_CABECALHO_US.find((c) => c.k === k).sugestoes;
    expect(de("chanfro")).toEqual(expect.arrayContaining(["X", "V"]));
    expect(de("processoSolda")).toEqual(expect.arrayContaining(["GMAW", "FCAW"]));
  });

  it("o que se preenche em cada campo sai no PDF", async () => {
    const marca = (i) => `K${String(i).padStart(2, "0")}K`;
    const resultados = Object.fromEntries(DO_PDF.map((k, i) => [k, marca(i)]));
    const pdf = await gerarUSPDF({ rel: { codigo: "RUS-113-001", opNumero: "113", marcas: ["T113A1"], linhas: [], equipamentos: [], resultados } });
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    const faltando = DO_PDF.filter((k, i) => !text.includes(marca(i)));
    expect(faltando).toEqual([]);
  });

  it("cabeçote escolhido da lista e dimensão ajustada à mão: o MODELO continua limpo", () => {
    expect(camposCabecalhoUS({ resultados: { cbModelo: "angular 20x22 · 70 · 2 MHz", cbDimensoes: "25x25" } }))
      .toMatchObject({ cbModelo: "angular", cbDimensoes: "25x25", cbFrequencia: "2 MHz" });
  });
});
