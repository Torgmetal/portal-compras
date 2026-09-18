// A descrição da cota é digitável e sobrevive à renumeração (Vitor, 18/09/2026: "estamos tentando
// colocar as descrições das cotas no relatório de pré montagem da OP-105, e não estamos conseguindo").
import { describe, expect, it } from "vitest";
import { letraDaCota, descricaoPadraoCota, ehDescricaoPadraoCota, renumerarCotas } from "@/lib/cota-marcacao";

const cota = (letra, descricao, extra = {}) => ({ letra, descricao, projetoMm: 100, tolerancia: "± 3", ...extra });

describe("letra e rótulo automático", () => {
  it("segue o alfabeto e continua depois do Z", () => {
    expect(letraDaCota(0)).toBe("A");
    expect(letraDaCota(25)).toBe("Z");
    expect(letraDaCota(26)).toBe("C27");
  });
  it("o rótulo automático é 'Cota <letra>'", () => {
    expect(descricaoPadraoCota("B")).toBe("Cota B");
  });
});

describe("ehDescricaoPadraoCota", () => {
  it("reconhece o rótulo automático, inclusive vazio e fora do alfabeto", () => {
    expect(ehDescricaoPadraoCota("Cota A")).toBe(true);
    expect(ehDescricaoPadraoCota("cota  b")).toBe(true);
    expect(ehDescricaoPadraoCota("Cota C27")).toBe(true);
    expect(ehDescricaoPadraoCota("")).toBe(true);
    expect(ehDescricaoPadraoCota(null)).toBe(true);
  });
  it("texto de gente não é rótulo automático", () => {
    expect(ehDescricaoPadraoCota("Vão entre apoios")).toBe(false);
    expect(ehDescricaoPadraoCota("Cota de topo")).toBe(false);
  });
});

describe("renumerarCotas", () => {
  it("fecha o buraco das letras depois de remover uma cota", () => {
    const r = renumerarCotas([cota("A", "Cota A"), cota("C", "Cota C")]);
    expect(r.map((c) => c.letra)).toEqual(["A", "B"]);
    expect(r.map((c) => c.descricao)).toEqual(["Cota A", "Cota B"]);
  });

  it("⚠ a descrição DIGITADA sobrevive à renumeração", () => {
    const r = renumerarCotas([cota("B", "Vão entre apoios"), cota("C", "Cota C")]);
    expect(r[0]).toMatchObject({ letra: "A", descricao: "Vão entre apoios" });
    expect(r[1]).toMatchObject({ letra: "B", descricao: "Cota B" });
  });

  it("preserva o resto da cota (medida, tolerância, marcação)", () => {
    const r = renumerarCotas([cota("A", "Cota A", { ax: 10, ay: 20, lado: "esq", encontradoMm: 99 })]);
    expect(r[0]).toMatchObject({ ax: 10, ay: 20, lado: "esq", encontradoMm: 99, projetoMm: 100, tolerancia: "± 3" });
  });

  it("lista vazia ou nula não quebra", () => {
    expect(renumerarCotas([])).toEqual([]);
    expect(renumerarCotas(null)).toEqual([]);
  });
});
