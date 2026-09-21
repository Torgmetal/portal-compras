// O rodapé da planilha não é uma peça — e a regra tem de ser UMA só.
//
// ⚠⚠ Esta linha já dobrou o peso de uma obra: a "marca" do rodapé da FORM 21 é "TOTAL.:" e a
// quantidade dela é a SOMA das outras, então o descarte por `qtd === 0` não pega. A OP-071 aparecia
// com 18.664 kg em vez de 9.332.
import { describe, it, expect } from "vitest";
import { ehLinhaDeTotal } from "@/lib/linha-de-total";
import { ehLinhaDeTotal as daExpedicao } from "@/lib/itens-expedicao";

describe("ehLinhaDeTotal", () => {
  it("pega as formas que a planilha usa de verdade", () => {
    for (const m of ["TOTAL.:", "TOTAL GERAL", "total", "  Total .: ", "SUBTOTAL", "Soma", "SOMA GERAL"]) {
      expect(ehLinhaDeTotal(m), m).toBe(true);
    }
  });

  // ⚠ Era `startsWith("total")` no parser: SUBTOTAL e SOMA passavam por ali. E quem importa pelo
  // SharePoint grava o que o parser devolve, sem passar pelo importador que filtrava o resto.
  it("⚠ SUBTOTAL e SOMA também entram — o parser cobria só TOTAL", () => {
    expect(ehLinhaDeTotal("SUBTOTAL.:")).toBe(true);
    expect(ehLinhaDeTotal("SOMA")).toBe(true);
  });

  it("não engole marca de verdade que começa parecido", () => {
    for (const m of ["TOTALIZADOR", "T97A-P30", "SOMATORIO-01", "TOTEM-1", "SUBTOTALIZADOR"]) {
      expect(ehLinhaDeTotal(m), m).toBe(false);
    }
  });

  it("acento não escapa da regra", () => {
    expect(ehLinhaDeTotal("TOTÁL")).toBe(true);
  });

  it("vazio, nulo e não-texto não quebram", () => {
    for (const m of [null, undefined, "", "   ", 123, {}]) expect(ehLinhaDeTotal(m)).toBe(false);
  });

  it("⚠⚠ a expedição usa exatamente a mesma função — duas cópias foi o defeito", () => {
    expect(daExpedicao).toBe(ehLinhaDeTotal);
  });
});
