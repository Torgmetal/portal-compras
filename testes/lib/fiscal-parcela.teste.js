import { describe, it, expect } from "vitest";
import { montarParcela } from "@/lib/fiscal/parcela";

const DOC = { itens: [
  { item: 1, ncm: "84313900", cfop: "6101", quantidade: 100, valorUnitario: 10, valor: 1000, ipi: { aliquota: 5, base: 1000, valor: 50 }, icms: { aliquota: 12, base: 1000, valor: 120 } },
  { item: 2, ncm: "73089010", cfop: "6101", quantidade: 10, valorUnitario: 50, valor: 500, ipi: { aliquota: 0, base: 500, valor: 0 }, icms: { aliquota: 12, base: 500, valor: 60 } },
] };

describe("montarParcela", () => {
  it("escala valor e bases pela quantidade da parcela e tira os não marcados", () => {
    const { doc } = montarParcela(DOC, [{ item: 1, quantidade: 25 }]);
    expect(doc.itens).toHaveLength(1);
    expect(doc.itens[0]).toMatchObject({ quantidade: 25, valor: 250, ipi: { base: 250, valor: 12.5 }, icms: { base: 250, valor: 30 } });
  });
  it("quantidade cheia é o próprio item", () => {
    const { doc } = montarParcela(DOC, [{ item: 2, quantidade: 10 }]);
    expect(doc.itens[0]).toMatchObject({ valor: 500, ipi: { base: 500 } });
  });
  it("não altera o documento original", () => {
    montarParcela(DOC, [{ item: 1, quantidade: 1 }]);
    expect(DOC.itens[0].valor).toBe(1000);
  });
  it.each([
    [[{ item: 1, quantidade: 101 }], /acima/],
    [[{ item: 1, quantidade: 0 }], /maior que zero/],
    [[{ item: 1, quantidade: -3 }], /maior que zero/],
    [[{ item: 9, quantidade: 1 }], /não existe/],
    [[], /Marque/],
    [[{ item: 1, quantidade: 1 }, { item: 1, quantidade: 2 }], /repetido/],
  ])("⚠ seleção inválida é recusada, não corrigida: %j", (sel, msg) => {
    expect(montarParcela(DOC, sel).erro).toMatch(msg);
  });
});

import { totaisPorTributo } from "@/lib/fiscal/parcela";

describe("totaisPorTributo", () => {
  it("soma por tributo só o que tem valor; sem valor em nenhum item fica null", () => {
    const t = totaisPorTributo([
      { linhas: [{ tributo: "IPI", valor: 12.5 }, { tributo: "CBS", valor: null }] },
      { linhas: [{ tributo: "IPI", valor: 0.25 }, { tributo: "CBS", valor: null }] },
    ]);
    expect(t).toEqual([{ tributo: "IPI", valor: 12.75 }, { tributo: "CBS", valor: null }]);
  });
});
