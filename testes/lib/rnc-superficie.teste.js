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

  it("pull-off: a adesão média e cada dolly, com o rompimento e a falha", () => {
    const t = descreverReprovacao({ tipo: "PULL_OFF", codigo: "RPO-112-001", revisao: 0, linhas: [], resultados: {
      peca: "T112A1", dollies: [{ adesao: "3", rompimento: "A/B 100%", falha: "Adesão" }, { adesao: "4" }],
    } });
    expect(t).toContain("adesão média 3,5 MPa");
    expect(t).toContain("Dolly 1: 3 MPa, rompimento A/B 100%, falha de adesão.");
    expect(t).not.toContain("Sem detalhamento");
  });

  it("recebimento: o material, os lotes e os itens reprovados", () => {
    const t = descreverReprovacao({ tipo: "RECEBIMENTO_TINTA", codigo: "RRT-112-001", revisao: 0, linhas: [], resultados: {
      material: "Wegpoxi", fabricante: "WEG", lotes: [{ lote: "8912-1" }], checklist: { 3: "R", 4: "R", 1: "A" },
    } });
    expect(t).toContain("Wegpoxi (WEG), lotes A: 8912-1");
    expect(t).toContain("Itens reprovados: 3. Vazamento ou Exsudação; 4. Amassamento.");
  });

  it("recebimento reprovado por validade: a RNC diz qual lote venceu e quando", () => {
    const t = descreverReprovacao({ tipo: "RECEBIMENTO_TINTA", codigo: "RRT-112-002", revisao: 0, linhas: [], createdAt: "2026-10-01T12:00:00Z", resultados: {
      material: "Wegpoxi", dataInspecao: "2026-10-01", lotes: [{ lote: "8912-1", validade: "2027-03-15" }, { lote: "8913-1", validade: "2026-09-30" }],
      checklist: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, "A"])),
    } });
    expect(t).toContain("Lote vencido na data do recebimento: componente B (validade 30/09/2026).");
    expect(t).not.toContain("Itens reprovados");
  });

  it("pull-off com dolly sem ruptura: a RNC diz '> 20 MPa, sem ruptura' e a média como mínimo", () => {
    const t = descreverReprovacao({ tipo: "PULL_OFF", codigo: "RPO-112-002", revisao: 0, linhas: [], resultados: {
      dollies: [{ adesao: "20", falha: "Sem ruptura" }, { adesao: "3", rompimento: "A/B 100%", falha: "Adesão" }],
    } });
    expect(t).toContain("adesão média > 11,5 MPa");
    expect(t).toContain("Dolly 1: > 20 MPa, sem ruptura.");
  });
});
