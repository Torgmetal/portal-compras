// @vitest-environment jsdom
// A prévia do esquema por estrutura no editor do PLP (Vitor, 15/10/2026): mostra o que cada estrutura recebe e
// avisa o que não fecha — o mesmo que trava a folha do pintor.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import EsquemaPrevia from "@/app/comercial/[id]/EsquemaPrevia";
afterEach(cleanup);

const demaos = [
  { ordem: 1, nome: "Primer", produto: "Jotamastic 90", cor: "Cinza" },
  { ordem: 3, nome: "Acabamento", produto: "Hardtop XP", cor: "Azul" },
  { ordem: 3, nome: "Acabamento", produto: "Hardtop XP", cor: "Amarelo" },
];

describe("prévia do esquema no editor do PLP", () => {
  it("mostra a sequência de cada estrutura", () => {
    render(<EsquemaPrevia plano={{ demaos, itens: [{ item: "Guarda Corpos", cor: "Amarelo" }] }} />);
    expect(screen.getByText("Guarda Corpos")).toBeTruthy();
    expect(screen.getByText(/2ª Acabamento — Hardtop XP \(Amarelo\)/)).toBeTruthy();
  });
  it("avisa a cor de item sem acabamento", () => {
    render(<EsquemaPrevia plano={{ demaos, itens: [{ item: "Escadas", cor: "Preto" }] }} />);
    expect(screen.getByText(/Escadas \(Preto\): nenhuma demão 3/)).toBeTruthy();
  });
});
