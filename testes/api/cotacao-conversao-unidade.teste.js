import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
import { aplicarConversao } from "@/app/api/cotacao/[id]/lancar-manual/route";

// ─── A CONVERSÃO ACONTECE NO SERVIDOR ────────────────────────────────────────
//
// O comprador digita o que está no papel do fornecedor ("25 CT a R$ 50,00"); o portal grava na
// unidade da RM ("2500 UN a R$ 0,50"), que é a base em que os outros 25 consumidores já leem.

const item = (extra) => ({
  rmItemId: "i1", precoUnit: 50, qtdCotada: 25,
  unidadeRM: "UN", unidadeCotada: "CT", fatorParaRM: 100, ...extra,
});

describe("aplicarConversao", () => {
  it("25 CT a R$ 50,00 vira 2500 UN a R$ 0,50", () => {
    const r = aplicarConversao(item());
    expect(r.item).toMatchObject({ qtdCotada: 2500, precoUnit: 0.5, unidadeCotada: "CT", fatorParaRM: 100 });
    expect(r.converteu).toBe(true);
  });

  // ⚠⚠ A ARMADILHA DO ARREDONDAMENTO. A rota arredonda preço e quantidade a duas casas; com
  // R$ 49,99 o cento, o unitário vira R$ 0,4999 e o `round2` o levaria a R$ 0,50 — o total saltaria
  // de R$ 1.249,75 para R$ 1.250,00. O que tem de fechar no centavo é o TOTAL, que é o que o
  // fornecedor assinou; o unitário convertido guarda as casas de que precisa.
  it("R$ 49,99 o cento não perde centavo no total", () => {
    const r = aplicarConversao(item({ precoUnit: 49.99 }));
    expect(r.item.precoUnit).toBeCloseTo(0.4999, 6);
    expect(Math.round(r.item.qtdCotada * r.item.precoUnit * 100) / 100).toBe(1249.75);
  });

  // ⚠ Sem fator (ou com fator 1) o caminho é exatamente o de antes — é o que mantém as cotações já
  // recebidas funcionando sem tratamento nenhum.
  it.each([
    [{ fatorParaRM: null }],
    [{ fatorParaRM: 1, unidadeCotada: "UN" }],
    [{ unidadeCotada: null }],
    [{ unidadeRM: "LATA 2,80L" }],
  ])("sem conversão, arredonda e segue (%o)", (extra) => {
    const r = aplicarConversao(item({ precoUnit: 12.345, qtdCotada: 7.891, ...extra }));
    expect(r.converteu).toBe(false);
    expect(r.item).toMatchObject({ precoUnit: 12.35, qtdCotada: 7.89, unidadeCotada: null, fatorParaRM: null });
  });

  // ⚠ Telha: o fator é o comprimento, informado por quem tem o documento na mão.
  it("130 ML a R$ 10,00 com 25 UN no papel fecha em R$ 1.300,00", () => {
    const r = aplicarConversao(item({ precoUnit: 10, qtdCotada: 130, unidadeCotada: "M", fatorParaRM: 25 / 130 }));
    expect(r.item.qtdCotada).toBe(25);
    expect(Math.round(r.item.qtdCotada * r.item.precoUnit * 100) / 100).toBe(1300);
  });

  it("o resumo diz a conversão, para a trilha", () => {
    expect(aplicarConversao(item()).resumo).toBe("25 CT → 2500 UN");
  });
});
