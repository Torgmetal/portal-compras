import { describe, expect, it } from "vitest";
import { extractText } from "unpdf";
import { gerarLPPDF } from "@/lib/relatorio-lp-pdf";
import { gerarEVSPDF } from "@/lib/relatorio-evs-pdf";

// A junta soldada no PDF (23/09/2026). O EVS-102-001 tem juntas de GMAW e de SMAW: o cabeçalho lista
// as duas EPS, e com a linha de largura fixa saía "EPS 001/2025, E…" — a reticência que a casa já
// proibiu para dado de documento ("precisa sair 100%", Vitor, 04/09/2026).

const texto = async (pdf) => (await extractText(new Uint8Array(pdf), { mergePages: true })).text;
const base = { codigo: "TESTE-102-001", opNumero: "102", revisao: 0, emitidoEm: new Date("2026-09-23T12:00:00Z"), marcas: ["T102B34"], equipamentos: [] };
const juntaDupla = {
  eps: "EPS 001/2025, EPS 004/2025", rqs: "RQPS 001/2025, RQPS 004/2025",
  processoSolda: "GMAW, SMAW", metalAdicao: "ER70S-6, E7018", tipoJunta: "Topo e ângulo",
};
const semCorte = (txt) => {
  const juntos = txt.replace(/\s+/g, " ");
  for (const v of ["EPS 004/2025", "RQPS 004/2025", "SMAW", "E7018", "Topo e ângulo"]) expect(juntos).toContain(v);
  expect(juntos).not.toMatch(/EPS 00\d\/20\.\.\.|RQPS 00\d\/2\.\.\.|E\.\.\./);
};

describe("a junta soldada no PDF", () => {
  it("LP com duas EPS: tudo sai inteiro", async () => {
    semCorte(await texto(await gerarLPPDF({ rel: { ...base, linhas: [], resultados: juntaDupla } })));
  });

  it("EVS com duas EPS: tudo sai inteiro", async () => {
    semCorte(await texto(await gerarEVSPDF({ rel: { ...base, linhas: [], resultados: juntaDupla } })));
  });

  it("a EPS da junta sai com o número do documento, como o cabeçalho — não com o nome do arquivo", async () => {
    const pdf = await gerarEVSPDF({ rel: { ...base, resultados: { eps: "EPS 001/2025" }, linhas: [
      { marca: "T102B34", qtd: 1, eps: "EPS-RQPS 01", soldador: "DANIEL DA SILVA", sinete: "S-01", laudo: "A" },
      { marca: "T102B62", qtd: 1, eps: "EPS-99", soldador: "OUTRO", laudo: "A" },
    ] } });
    const txt = await texto(pdf);
    expect(txt).not.toContain("EPS-RQPS 01");
    expect((txt.match(/EPS 001\/2025/g) || []).length).toBeGreaterThanOrEqual(2);
    // EPS fora da ficha sai como foi gravada
    expect(txt).toContain("EPS-99");
  });
});
