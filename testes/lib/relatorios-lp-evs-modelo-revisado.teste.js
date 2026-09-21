import { describe, expect, it } from "vitest";
import { extractText } from "unpdf";
import { gerarLPPDF } from "@/lib/relatorio-lp-pdf";
import { gerarEVSPDF } from "@/lib/relatorio-evs-pdf";

async function texto(pdf) {
  return (await extractText(new Uint8Array(pdf), { mergePages: true })).text;
}

const base = {
  codigo: "TESTE-102-001",
  opNumero: "102",
  revisao: 0,
  emitidoEm: new Date("2026-09-21T12:00:00Z"),
  marcas: ["T102B34"],
  equipamentos: [],
  linhas: [],
};

describe("modelos revisados de LP e EVS", () => {
  it("LP imprime os novos campos de rastreabilidade da soldagem", async () => {
    const pdf = await gerarLPPDF({
      rel: {
        ...base,
        resultados: {
          desenho: "T102B34",
          revisaoDesenho: "02",
          desenhoCliente: "SE-024",
          revisaoCliente: "A",
          metalBase: "Aço carbono",
          metalAdicao: "E71T-1",
          processoSolda: "FCAW",
          eps: "EPS-01",
          rqs: "RQS-04",
          tipoJunta: "Filete",
        },
      },
    });
    const txt = await texto(pdf);
    for (const valor of ["T102B34", "SE-024", "E71T-1", "FCAW", "EPS-01", "RQS-04", "Filete"]) {
      expect(txt).toContain(valor);
    }
  });

  it("EVS imprime identificação e parâmetros conforme o modelo revisado", async () => {
    const pdf = await gerarEVSPDF({
      rel: {
        ...base,
        resultados: {
          desenho: "T102B34",
          revisaoDesenho: "02",
          desenhoCliente: "SE-024",
          revisaoCliente: "A",
          metalBase: "Aço carbono",
          metalAdicao: "E71T-1",
          processoSolda: "FCAW",
          eps: "EPS-01",
          rqs: "RQS-04",
          tipoJunta: "Filete",
          iluminacao: "1935",
          procedimento: "PO-06 R1",
          criterio: "AWS D1.1:2025",
        },
      },
    });
    const txt = await texto(pdf);
    for (const valor of ["T102B34", "SE-024", "E71T-1", "FCAW", "EPS-01", "RQS-04", "Filete"]) {
      expect(txt).toContain(valor);
    }
  });
});
