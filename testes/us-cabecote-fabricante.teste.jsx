// @vitest-environment jsdom
// O CABEÇOTE DOPPLER ERA GRAVADO COMO MITECH.
//
// Achado do Codex (22/09/2026): os dois fabricantes têm "angular 20x22" nos mesmos três ângulos, e
// o rótulo deixou de carregar a marca (Vitor: "tirar esse Mitech, pois já informamos a marca dele
// antes"). As duas telas resolviam o fabricante procurando pelo RÓTULO — que acha Mitech primeiro.
// O relatório de ultrassom, que vai ao cliente, identificava o equipamento errado.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import FormularioUSCampo from "@/app/campo/FormularioUSCampo";
import { cabecotesPorFabricante, chaveCabecote, cabecoteDaChave } from "@/lib/us-campos";

afterEach(cleanup);

describe("a identidade do cabeçote", () => {
  it("cada opção da lista é única, ainda que duas marcas tenham o mesmo rótulo", () => {
    const valores = cabecotesPorFabricante().flatMap((g) => g.itens.map((i) => i.valor));
    expect(new Set(valores).size).toBe(valores.length);
    // o rótulo sozinho NÃO identifica — é exatamente por isso que existe a chave
    const rotulos = cabecotesPorFabricante().flatMap((g) => g.itens.map((i) => i.rotulo));
    expect(new Set(rotulos).size).toBeLessThan(rotulos.length);
  });

  it("a chave leva a marca e devolve o rótulo intacto", () => {
    const chave = chaveCabecote("Doppler", "angular 20x22 · 45 · 2 MHz");
    expect(cabecoteDaChave(chave)).toEqual({ fabricante: "Doppler", rotulo: "angular 20x22 · 45 · 2 MHz" });
    expect(cabecoteDaChave("")).toEqual({ fabricante: "", rotulo: "" });
  });
});

// ⚠ Desde 25/09/2026 fabricante e modelo do cabeçote são CAMPOS PRÓPRIOS, os dois ajustáveis (Vitor:
// "todos os campos precisamos deixar para ser possível ajustar"). A marca não é mais descoberta pelo
// rótulo — que era exatamente o que trocava Doppler por Mitech —, é escolhida ou digitada.
it("escolher o Doppler no celular grava Doppler, não Mitech", () => {
  let cond = {};
  const setCond = (fn) => { cond = typeof fn === "function" ? fn(cond) : fn; };
  const { rerender } = render(<FormularioUSCampo rel={{ marcas: ["T113A1"], resultados: {} }} cond={cond} setCond={setCond} />);

  fireEvent.change(screen.getByLabelText(/^Cabeçote — fabricante/), { target: { value: "Doppler" } });
  rerender(<FormularioUSCampo rel={{ marcas: ["T113A1"], resultados: {} }} cond={cond} setCond={setCond} />);
  fireEvent.change(screen.getByLabelText(/^Cabeçote — modelo/), { target: { value: "angular 20x22 · 45 · 2 MHz" } });

  expect(cond.cbFabricante).toBe("Doppler");
  expect(cond.cbModelo).toBe("angular 20x22 · 45 · 2 MHz");
});

it("a lista de modelos oferece cada rótulo uma vez — a marca é outro campo", () => {
  render(<FormularioUSCampo rel={{ marcas: ["T113A1"], resultados: {} }} cond={{}} setCond={() => {}} />);
  const lista = document.getElementById(screen.getByLabelText(/^Cabeçote — modelo/).getAttribute("list"));
  const valores = [...lista.querySelectorAll("option")].map((o) => o.value);
  expect(new Set(valores).size).toBe(valores.length);
  expect(valores).toContain("angular 20x22 · 45 · 2 MHz");
});

it("o PATCH do Campo grava o fabricante do cabeçote — ele estava fora da lista fechada", async () => {
  const { mockPrisma } = await import("@/testes/apoio/prisma");
  vi.doMock("@/lib/prisma", () => ({ prisma: mockPrisma }));
  vi.doMock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u" }) }));
  const { PATCH } = await import("@/app/api/campo/relatorios/[id]/route");
  let rel = { id: "r", tipo: "ULTRASSOM", marcas: ["P1"], linhas: [], equipamentos: [], resultados: {} };
  mockPrisma.relatorioInspecao.findUnique.mockImplementation(async () => rel);
  mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => (rel = { ...rel, ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
  const r = await PATCH(new Request("http://localhost", {
    method: "PATCH",
    body: JSON.stringify({ condicoes: { cbFabricante: "Doppler", cbModelo: "angular 20x22 · 45 · 2 MHz" } }),
  }), { params: { id: "r" } });
  expect(r.status).toBe(200);
  expect(rel.resultados).toMatchObject({ cbFabricante: "Doppler", cbModelo: "angular 20x22 · 45 · 2 MHz" });
});
