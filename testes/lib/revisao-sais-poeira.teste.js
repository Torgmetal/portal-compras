// Reinspeção é medir de novo (lib/revisao-inspecao). Nos relatórios de sais e de poeira as leituras moram
// em `resultados` (amostras e testes), e a revisão nova não as limpava — o R01 nasceria com as leituras
// que reprovaram o R00, e um clique confirmaria sem medir. O que foi medido antes fica nas `revisoes`.
import { describe, it, expect } from "vitest";
import { proximaRevisao } from "@/lib/revisao-inspecao";

describe("revisão nova de sais e poeira", () => {
  it("sais: limpa as amostras e guarda o cabeçalho e o critério; o R00 fica congelado", () => {
    const rel = { tipo: "SAIS", revisao: 0, resultadoInspecao: "REPROVADO", linhas: [],
      resultados: { requisito: "20", volumeAgua: "3", apModelo: "EC-33", dataInspecao: "2026-10-01", amostras: [{ condAgua: "1", condAmostra: "40", hora: "09:00" }] } };
    const r = proximaRevisao(rel);
    expect(r.revisao).toBe(1);
    expect(r.resultados.amostras).toEqual([]);
    expect(r.resultados.dataInspecao).toBeNull(); // a reinspeção é outro ensaio, em outro dia
    expect(r.resultados).toMatchObject({ requisito: "20", volumeAgua: "3", apModelo: "EC-33" });
    expect(r.revisoes[0].resultados.amostras[0].condAmostra).toBe("40");
  });

  it("poeira: limpa os testes e a classificação registrada", () => {
    const rel = { tipo: "POEIRA", revisao: 0, linhas: [], resultados: { fitaAdesiva: "25 mm", classificacao: "4", dataInspecao: "2026-10-01", testes: [{ local: "Alma", quantidade: "4", tamanho: "4" }] } };
    const r = proximaRevisao(rel);
    expect(r.resultados.testes).toEqual([]);
    expect(r.resultados.dataInspecao).toBeNull();
    expect(r.resultados.classificacao).toBeNull();
    expect(r.resultados.fitaAdesiva).toBe("25 mm");
  });

  it("dimensional e pré-montagem: o resultado e as três verificações da rodada anterior não passam para o R01", () => {
    for (const tipo of ["DIMENSIONAL", "PRE_MONTAGEM"]) {
      const r = proximaRevisao({ tipo, linhas: [], resultados: { resultado: "Reprovado", dimensional: "REPROVADO", alinhamento: "APROVADO", acabamento: "APROVADO", procedimento: "PO-04", qtdPeca: { T1: 2 } } });
      expect(r.resultados).toMatchObject({ resultado: null, dimensional: null, alinhamento: null, acabamento: null, procedimento: "PO-04", qtdPeca: { T1: 2 } });
    }
  });

  it("pintura: limpa o laudo do formulário e as espessuras; a rugosidade e o resto ficam", () => {
    const r = proximaRevisao({ tipo: "PINTURA", linhas: [], resultados: { limpeza: "SA2.5", laudo: "REPROVADO", espessuras: { 1: ["120", "130"] }, rugosidade: { leituras: ["60"] } } });
    expect(r.resultados).toMatchObject({ limpeza: "SA2.5", laudo: null, espessuras: {}, rugosidade: { leituras: ["60"] } });
  });

  it("os outros tipos seguem como antes (não ganham `resultados` na revisão)", () => {
    expect(proximaRevisao({ tipo: "VISUAL_SOLDA", linhas: [], resultados: { eps: "EPS 01" } }).resultados).toBeUndefined();
  });
});
