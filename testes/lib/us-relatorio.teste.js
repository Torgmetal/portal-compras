import { describe, expect, it } from "vitest";
import { camposCabecalhoUS } from "@/lib/us-relatorio";
import { extractText } from "unpdf";
import { gerarUSPDF } from "@/lib/relatorio-us-pdf";

describe("camposCabecalhoUS", () => {
  it("leva a marca ao TAG e separa o cabeçote salvo pelo formulário", () => {
    expect(camposCabecalhoUS({
      marcas: ["T113A1"],
      resultados: {
        apModelo: "Mitech MDF350B",
        apSerie: "FD10012912",
        cbModelo: "Mitech angular 20x22 · 70° · 2 MHz",
        cbAngulo: "70",
        cbSerie: "2206365",
      },
    })).toMatchObject({
      tag: "T113A1",
      apFabricante: "Mitech",
      apModelo: "MDF350B",
      apSerie: "FD10012912",
      cbFabricante: "Mitech",
      cbModelo: "angular",
      cbDimensoes: "20x22",
      cbAngulo: "70°",
      cbFrequencia: "2 MHz",
      cbSerie: "2206365",
    });
  });

  it("preserva os campos explícitos e aplica procedimento e norma do US", () => {
    expect(camposCabecalhoUS({
      marcas: ["T1"],
      resultados: {
        tag: "TAG-CLIENTE",
        procedimento: "PI-QUA-003 - R1",
        norma: "AWS D1.1",
        cbFabricante: "Outro",
        cbModelo: "Modelo X",
        cbDimensoes: "10x12",
        cbFrequencia: "4 MHz",
      },
    })).toMatchObject({
      tag: "TAG-CLIENTE",
      procedimento: "PI-QUA-003 - R1",
      norma: "AWS D1.1",
      cbFabricante: "Outro",
      cbModelo: "Modelo X",
      cbDimensoes: "10x12",
      cbFrequencia: "4 MHz",
    });
  });

  it("corrige o vínculo legado do PO-06 no ultrassom", () => {
    const campos = camposCabecalhoUS({ resultados: { procedimento: "PO-06 Ensaio Visual de Solda - R1" } });
    expect(campos.procedimento).toBe("PI-QUA-003 - Procedimento de US AWS D1.1");
    expect(campos.norma).toBe("AWS D1.1");
    expect(campos.criterio).toBe("AWS D1.1");
  });
});

describe("PDF de ultrassom", () => {
  it("imprime os dados salvos no RUS-113-001 nos campos corretos", async () => {
    const pdf = await gerarUSPDF({ rel: {
      codigo: "RUS-113-001", opNumero: "113", marcas: ["T113A1"], linhas: [], equipamentos: [],
      resultados: {
        local: "TORG METAL LTDA", apModelo: "Mitech MDF350B", apSerie: "FD10012912",
        cbModelo: "Mitech angular 20x22 · 70° · 2 MHz", cbAngulo: "70", cbSerie: "2206365",
        acoplante: "Metilcelulose em água", blocoPadrao: "V2", ganhoVarredura: "80",
        procedimento: "PO-06 Ensaio Visual de Solda - R1",
      },
    }});
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    for (const esperado of ["T113A1", "PI-QUA-003", "AWS D1.1", "MDF350B", "20x22", "2 MHz", "FD10012912", "2206365"]) {
      expect(text).toContain(esperado);
    }
  });
});
