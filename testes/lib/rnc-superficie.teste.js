// A RNC que nasce de um relatório de sais ou de poeira reprovado pelo celular (lib/rnc-de-inspecao).
// Esses dois não reprovam por linha — as leituras moram em `resultados` —, e a RNC saía com "Sem
// detalhamento das linhas reprovadas." (verificação de 02/10/2026). O PO-07 cobra análise de causa, e
// análise de causa sem número não existe.
import { describe, it, expect } from "vitest";
import { descreverReprovacao } from "@/lib/rnc-de-inspecao";

describe("RNC de sais e poeira diz o que reprovou", () => {
  it("sais: média contra o requisito, a etapa, a peça e cada leitura", () => {
    const t = descreverReprovacao({ tipo: "SAIS", codigo: "RCS-112-001", revisao: 0, linhas: [], resultados: {
      peca: "T112A1", etapaPintura: "Após o jateamento", requisito: "20",
      amostras: [{ condAgua: "1", condAmostra: "31" }, { condAgua: "1", condAmostra: "21" }],
    } });
    expect(t).toContain("Densidade média de sais 30 mg/m² contra o requisito de 20 mg/m²");
    expect(t).toContain("peça T112A1, Após o jateamento");
    expect(t).toContain("amostra 1: 36 mg/m²; amostra 2: 24 mg/m²");
    expect(t).not.toContain("Sem detalhamento");
  });

  it("poeira: as classes de cada teste, a média e a classificação", () => {
    const t = descreverReprovacao({ tipo: "POEIRA", codigo: "RTP-112-001", revisao: 0, linhas: [], resultados: {
      etapaPintura: "Antes da 1ª demão", testes: [{ local: "Alma", quantidade: "4", tamanho: "5", obs: "pó de lixamento" }, { quantidade: "3", tamanho: "4" }],
    } });
    expect(t).toContain("quantidade média classe 4, partículas classe 5");
    expect(t).toContain("Teste A (Alma): quantidade 4, tamanho 5 — pó de lixamento.");
    expect(t).toContain("Teste B: quantidade 3, tamanho 4.");
    expect(t).not.toContain("Sem detalhamento");
  });
});
