// A % de diluição escrita no texto (Vitor, 15/10/2026: "não estou conseguindo colocar a % de diluição"). Sem boletim
// no catálogo o editor só oferecia o campo de TEXTO do diluente, e "10%" (como está gravado nas duas demãos da OP-102)
// não virava número — a diluição ficava vazia e a folha do pintor travava.
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { diluicaoPct } from "@/lib/consumo-tinta-plp";

describe("diluição do PLP", () => {
  it("o campo numérico vale primeiro", () => {
    expect(diluicaoPct({ diluicaoPct: "5", diluicao: "10%" })).toBe(5);
    expect(diluicaoPct({ diluicaoPct: 0 })).toBe(0);
  });
  it("sem ele, lê a % escrita no texto do diluente", () => {
    expect(diluicaoPct({ diluicao: "10%" })).toBe(10);
    expect(diluicaoPct({ diluicao: "Jotun Thinner No. 17 · 7,5%" })).toBe(7.5);
    expect(diluicaoPct({ diluicao: "12" })).toBe(12);
  });
  it("texto sem número não vira zero", () => {
    expect(diluicaoPct({ diluicao: "Thinner 17" })).toBe(null);
    expect(diluicaoPct({ diluicao: "" })).toBe(null);
  });
});
