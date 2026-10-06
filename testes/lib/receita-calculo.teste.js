// O modal de receita da OP lia o valor com `Number()`. Desde 16/09/2026 o campo é o `CampoDecimal`,
// que entrega o texto em português ("519539,62"), e `Number("519539,62")` é NaN: o valor virava zero
// ("Valor da receita deve ser maior que zero") e as alíquotas com vírgula sumiam da conta e do
// payload (NaN vai no JSON como null). Matheus (Comercial), 06/10/2026.
import { describe, it, expect } from "vitest";
import { calcularReceita, aliquotasParaGravar } from "@/lib/receita-calculo";

const ALIQ = { icmsPct: "12", ipiPct: "3,25", pisPct: "1,65", cofinsPct: "7,6", issPct: "0", irrfPct: "3", csllPct: "1,08" };

describe("receita com valor fechado", () => {
  it("lê o valor com vírgula (o caso do Matheus)", () => {
    const r = calcularReceita({ tipoPreco: "VALOR", valor: "519539,62", ...ALIQ });
    expect(r.valorNum).toBeCloseTo(519539.62, 2);
  });

  it("soma todas as alíquotas, inclusive as com vírgula", () => {
    const r = calcularReceita({ tipoPreco: "VALOR", valor: "1000", ...ALIQ });
    expect(r.aliqTotal).toBeCloseTo(28.58, 2);
    expect(r.impostosVal).toBeCloseTo(285.8, 2);
    expect(r.liquido).toBeCloseTo(714.2, 2);
  });

  it("aceita o número que veio do banco ao editar", () => {
    expect(calcularReceita({ tipoPreco: "VALOR", valor: 519539.62 }).valorNum).toBeCloseTo(519539.62, 2);
  });

  it("aceita milhar com ponto", () => {
    expect(calcularReceita({ tipoPreco: "VALOR", valor: "519.539,62" }).valorNum).toBeCloseTo(519539.62, 2);
  });
});

describe("receita por unidade", () => {
  it("quantidade e unitário com vírgula", () => {
    const r = calcularReceita({ tipoPreco: "POR_UNIDADE", quantidade: "19857,72", valorUnitario: "26,56" });
    expect(r.porUnidade).toBe(true);
    expect(r.valorNum).toBeCloseTo(19857.72 * 26.56, 2);
  });
});

describe("alíquotas no payload", () => {
  it("vírgula vira número, campo vazio vira null, nunca NaN", () => {
    const p = aliquotasParaGravar({ ...ALIQ, issPct: "" });
    expect(p.ipiPct).toBeCloseTo(3.25, 4);
    expect(p.cofinsPct).toBeCloseTo(7.6, 4);
    expect(p.csllPct).toBeCloseTo(1.08, 4);
    expect(p.issPct).toBeNull();
    expect(Object.values(p).some((v) => Number.isNaN(v))).toBe(false);
  });
});
