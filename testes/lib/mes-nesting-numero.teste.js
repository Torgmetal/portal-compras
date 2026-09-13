import { describe, it, expect } from "vitest";
import { numeroLocal, numeroTubesT, numeroLibellula } from "@/lib/mes/nesting/numero";

// ⚠⚠ OS DOIS SOFTWARES ESCREVEM NÚMERO DIFERENTE NO MESMO PLANO. Achado do Codex (13/09/2026):
// a minha conta do TubesT apagava todo ponto, então `679.60` viraria 67960 — um comprimento 100×
// maior, sem erro nenhum na tela.

describe("numeroLocal", () => {
  it("vírgula decimal (TubesT)", () => {
    expect(numeroTubesT("679,60")).toBe(679.6);
    expect(numeroTubesT("12000,00")).toBe(12000);
  });

  it("ponto decimal (Libellula)", () => {
    expect(numeroLibellula("9.53")).toBe(9.53);
    expect(numeroLibellula("1.352")).toBe(1.352);
  });

  // ⚠⚠ A AMBIGUIDADE É REAL E POR ISSO QUEM CHAMA DIZ A CONVENÇÃO: `1.500` é mil e quinhentos
  // milímetros no TubesT e um vírgula quinhentos quilos na Libellula. Adivinhar erra um dos dois.
  it("a mesma string dá números diferentes, e cada leitor sabe o seu", () => {
    expect(numeroTubesT("1.500")).toBe(1500);
    expect(numeroLibellula("1.500")).toBe(1.5);
  });

  it("os dois juntos: manda o último separador", () => {
    expect(numeroLocal("1.500,00")).toBe(1500);
    expect(numeroLocal("1,500.00")).toBe(1500);
  });

  it("sem convenção declarada, vale o último separador", () => {
    expect(numeroLocal("1.500")).toBe(1.5);
    expect(numeroLocal("1.500,25")).toBe(1500.25);
  });

  it("inteiro e vazio", () => {
    expect(numeroLocal("185")).toBe(185);
    expect(numeroLocal("")).toBeNull();
    expect(numeroLocal(null)).toBeNull();
    expect(numeroLocal("—")).toBeNull();
  });
});
