import { describe, it, expect } from "vitest";
import { BANCADAS, SOLDADOR_DA_BANCADA, nomeDaBancada, repartirPorBancada } from "@/lib/solda-capacidade";

describe("nome do soldador na bancada", () => {
  it("toda bancada viva tem um nome — nenhuma fica com o número na tela", () => {
    for (const b of BANCADAS) expect(nomeDaBancada(b)).not.toBe(b);
    expect(BANCADAS).toHaveLength(7);
  });

  it("um soldador por bancada — dois rótulos iguais confundiriam quem programa", () => {
    const nomes = Object.values(SOLDADOR_DA_BANCADA);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("Reinnan não entra: é de Montagem Externa, sem apontamento de bancada", () => {
    expect(Object.values(SOLDADOR_DA_BANCADA).join(" ")).not.toMatch(/reinnan/i);
  });

  it("o mapa segue o medido no Syneco — Diego na 1, Daniel na 2, Vando na 4", () => {
    expect(nomeDaBancada("SOLDA 1")).toBe("Diego Rivelino");
    expect(nomeDaBancada("SOLDA 2")).toBe("Daniel da Silva");
    expect(nomeDaBancada("SOLDA 4")).toBe("Vando Máximo");
  });

  it("Wilson e Eberton em bancadas separadas — a 5 era dividida 45/44", () => {
    expect(nomeDaBancada("SOLDA 5")).toBe("Wilson Barros");
    expect(nomeDaBancada("SOLDA 9")).toBe("Eberton Rogério");
  });

  it("bancada desconhecida devolve a própria chave, e vazio vira 'sem bancada'", () => {
    expect(nomeDaBancada("SOLDA 3")).toBe("SOLDA 3");
    expect(nomeDaBancada(null)).toBe("sem bancada");
    expect(nomeDaBancada("")).toBe("sem bancada");
  });

  it("aceita a chave com espaço e caixa trocados — vem de campo digitado", () => {
    expect(nomeDaBancada(" solda 7 ")).toBe("Christhian Moreira");
  });
});

describe("a chave não mudou", () => {
  it("repartir continua devolvendo SOLDA n, que é o que o Syneco aponta e o banco guarda", () => {
    const conj = Array.from({ length: 4 }, (_, i) => ({ marca: `M${i}`, qte: 1, pesoUnitKg: 100 }));
    const r = repartirPorBancada(conj, 2);
    expect(r.map((x) => x.bancada)).toEqual(["SOLDA 1", "SOLDA 2"]);
  });

  it("a sétima bancada é alcançável — antes o seletor parava em 6", () => {
    const conj = Array.from({ length: 7 }, (_, i) => ({ marca: `M${i}`, qte: 1, pesoUnitKg: 100 }));
    expect(repartirPorBancada(conj, 7).map((x) => x.bancada)).toContain("SOLDA 9");
  });
});
