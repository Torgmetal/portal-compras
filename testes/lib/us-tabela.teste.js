// A tabela do relatório de ultrassom. Vitor (25/09/2026), no RUS-113-001: "as informações não estão
// sendo colocadas na tabela abaixo no relatório de ultrassom; exemplo: nem a peça foi enviada para lá".
//
// Eram duas coisas. A tela e o Campo gravam a peça em `marca` e o PDF lia `peca`: a coluna saía
// vazia mesmo com indicação lançada. E só a descontinuidade REPROVADA vira linha (PI-QUA-003, item
// 15.1): um relatório aprovado imprimia a tabela em branco, sem dizer que peça foi ensaiada.
import { describe, it, expect } from "vitest";
import { extractText } from "unpdf";
import { linhasTabelaUS, SEM_INDICACAO } from "@/lib/us-relatorio";
import { gerarUSPDF } from "@/lib/relatorio-us-pdf";

const RUS_113 = {
  codigo: "RUS-113-001", opNumero: "113", marcas: ["T113A1"], linhas: [], equipamentos: [], resultadoInspecao: "APROVADO",
  resultados: {
    local: "TORG METAL LTDA", apModelo: "Mitech MDF350B", apSerie: "FD10012912",
    cbModelo: "Mitech angular 20x22 · 70° · 2 MHz", cbAngulo: "70", cbSerie: "2206365",
    acoplante: "Metilcelulose em água", blocoPadrao: "V2", ganhoVarredura: "80", qtdPeca: { T113A1: 12 },
  },
};

describe("linhas da tabela de indicações", () => {
  it("a peça aprovada sem indicação sai na tabela, com o ângulo do cabeçote e laudo A", () => {
    expect(linhasTabelaUS(RUS_113)).toEqual([
      { peca: "T113A1", indicacao: "—", angulo: "70", laudo: "A", obs: SEM_INDICACAO },
    ]);
  });

  it("em rascunho a peça aparece sem laudo — o portal não afirma aceitação que o inspetor não deu", () => {
    expect(linhasTabelaUS({ ...RUS_113, resultadoInspecao: null })).toEqual([
      { peca: "T113A1", indicacao: "—", angulo: "70", laudo: "", obs: "" },
    ]);
  });

  it("a indicação lançada pela tela sai com a peça — a tela grava `marca`", () => {
    const [l] = linhasTabelaUS({ ...RUS_113, resultadoInspecao: "REPROVADO", linhas: [{ marca: "T113A1", indicacao: "1", angulo: "70", laudo: "R" }] });
    expect(l).toMatchObject({ peca: "T113A1", indicacao: "1", laudo: "R" });
  });

  it("o \"Compr. reprovado\" da tela vai para a coluna Compr. Reprovado, não para a de inspecionado", () => {
    const [l] = linhasTabelaUS({ ...RUS_113, linhas: [{ marca: "T113A1", comprimento: "15", laudo: "R" }] });
    expect(l.reprovado).toBe("15");
    expect(l.inspecionado ?? "").toBe("");
  });

  it("peça com indicação reprovada não ganha a linha de aprovada; a outra peça ganha", () => {
    const r = linhasTabelaUS({
      ...RUS_113, resultadoInspecao: "REPROVADO", marcas: ["T1", "T2"],
      linhas: [{ marca: "t1", indicacao: "1", laudo: "R" }],
    });
    expect(r.map((l) => [l.peca, l.laudo])).toEqual([["t1", "R"], ["T2", "A"]]);
  });

  it("sem peça e sem indicação a tabela continua vazia", () => {
    expect(linhasTabelaUS({ marcas: [], linhas: [], resultadoInspecao: "APROVADO" })).toEqual([]);
  });
});

describe("PDF do RUS-113-001", () => {
  it("a T113A1 aparece na tabela, não só no cabeçalho", async () => {
    const { text } = await extractText(new Uint8Array(await gerarUSPDF({ rel: RUS_113 })), { mergePages: true });
    expect(text.split("T113A1").length - 1).toBeGreaterThanOrEqual(2); // TAG do cabeçalho + linha da tabela
    expect(text).toContain(SEM_INDICACAO);
  });
});
