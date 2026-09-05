import { describe, it, expect } from "vitest";
import { numeroBR } from "@/lib/numero-br";

// Os casos com nome e valor vieram da medição de 30/08/2026 documentada no
// topo de lib/numero-br.js — são os pedidos que quebravam no Omie.
describe("numeroBR — casos reais que quebravam o pedido no Omie", () => {
  it("lê milhar pt-BR com centavos (HARD PARAFUSOS)", () => {
    expect(numeroBR("4.963,43")).toBe(4963.43);
  });
  it("lê milhar pt-BR com centavos (AZEVEDO)", () => {
    expect(numeroBR("31.737,45")).toBe(31737.45);
  });
  it("ponto sozinho com 3 dígitos depois é milhar, não decimal", () => {
    expect(numeroBR("4.963")).toBe(4963);
  });
});

describe("numeroBR — formatos", () => {
  it.each([
    ["1.234,56", 1234.56, "pt-BR completo"],
    ["1,234.56", 1234.56, "en-US completo"],
    ["1,234,567", 1234567, "milhar en-US sem decimal"],
    ["0,125", 0.125, "três casas decimais em pt-BR"],
    ["12.50", 12.5, "preço unitário en-US com centavos"],
    ["R$ 1.234,56/kg", 1234.56, "com texto em volta"],
    ["-1.234,56", -1234.56, "negativo"],
    ["1234", 1234, "inteiro puro"],
  ])("%s -> %s (%s)", (entrada, esperado) => {
    expect(numeroBR(entrada)).toBe(esperado);
  });
});

describe("numeroBR — entradas que não são número", () => {
  it.each([[null], [undefined], [""], ["   "], ["abc"], ["R$"], [NaN], [Infinity]])(
    "%s devolve o padrão",
    (entrada) => {
      expect(numeroBR(entrada)).toBe(0);
    }
  );
  it("respeita um padrão diferente de zero", () => {
    expect(numeroBR("", 7)).toBe(7);
    expect(numeroBR(null, -1)).toBe(-1);
  });
  it("número já numérico passa direto", () => {
    expect(numeroBR(12.34)).toBe(12.34);
    expect(numeroBR(0)).toBe(0);
  });
});
