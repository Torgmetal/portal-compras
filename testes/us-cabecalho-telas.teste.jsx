// @vitest-environment jsdom
// As DUAS telas do relatório de ultrassom deixam preencher e ajustar TODO o cabeçalho (Vitor,
// 25/09/2026): "no campo de desenho e metal de adição não está sendo possível preencher (…) tipo de
// chanfro tbm, todos os campos precisamos deixar para ser possível ajustar". A lista da casa (chanfro
// X/V, processo GMAW/FCAW…) continua como sugestão; o que não está nela se digita.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CAMPOS_CABECALHO_US } from "@/lib/us-campos";

const { default: FormUS } = await import("@/app/qualidade/inspecoes/[id]/FormUS");
const { default: FormularioUSCampo } = await import("@/app/campo/FormularioUSCampo");

const REL = { codigo: "RUS-113-001", marcas: ["T113A1"], resultados: {} };
const rotulo = (r) => new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

beforeEach(() => { global.fetch = vi.fn(async () => ({ json: async () => ({ soldadores: [] }) })); });
afterEach(() => cleanup());

describe("no computador", () => {
  const abrir = (setResultado = vi.fn(), res = {}) =>
    render(<FormUS rel={REL} linhas={[]} res={res} travado={false} setLinhas={vi.fn()} setResultado={setResultado} />);

  it("todo campo do cabeçalho tem caixa de texto — nada fica preso a uma lista", () => {
    abrir();
    const semTexto = CAMPOS_CABECALHO_US.filter((c) => screen.getByLabelText(rotulo(c.rotulo)).tagName !== "INPUT").map((c) => c.k);
    expect(semTexto).toEqual([]);
  });

  it("o chanfro aceita valor fora da lista", () => {
    const setResultado = vi.fn();
    abrir(setResultado);
    fireEvent.change(screen.getByLabelText(rotulo("Tipo de chanfro")), { target: { value: "1/2 V" } });
    expect(setResultado).toHaveBeenCalledWith("chanfro", "1/2 V");
  });

  it("desenho e metal de adição se preenchem", () => {
    const setResultado = vi.fn();
    abrir(setResultado);
    fireEvent.change(screen.getByLabelText(rotulo("Desenho de referência")), { target: { value: "DE-118-01 R2" } });
    fireEvent.change(screen.getByLabelText(rotulo("Metal de adição")), { target: { value: "E71T-1C" } });
    expect(setResultado).toHaveBeenCalledWith("desenho", "DE-118-01 R2");
    expect(setResultado).toHaveBeenCalledWith("metalAdicao", "E71T-1C");
  });

  it("campo vazio mostra, apagado, o que vai sair no PDF", () => {
    abrir();
    expect(screen.getByLabelText(rotulo("Equipamento / TAG")).getAttribute("placeholder")).toBe("T113A1");
    expect(screen.getByLabelText(rotulo("Norma de referência")).getAttribute("placeholder")).toBe("AWS D1.1");
  });
});

describe("no celular (Campo)", () => {
  const abrir = (setCond = vi.fn(), cond = {}) => render(<FormularioUSCampo rel={REL} cond={cond} setCond={setCond} />);

  it("todo campo do cabeçalho tem caixa de texto — desenho, material e espessura inclusive", () => {
    abrir();
    const semTexto = CAMPOS_CABECALHO_US.filter((c) => screen.getByLabelText(rotulo(c.rotulo)).tagName !== "INPUT").map((c) => c.k);
    expect(semTexto).toEqual([]);
  });

  it("o que se digita vai para o relatório", () => {
    const setCond = vi.fn();
    abrir(setCond);
    fireEvent.change(screen.getByLabelText(rotulo("Desenho de referência")), { target: { value: "DE-118-01 R2" } });
    const atualizar = setCond.mock.calls.at(-1)[0];
    expect(atualizar({ local: "TORG" })).toEqual({ local: "TORG", desenho: "DE-118-01 R2" });
  });

  it("o chanfro aceita valor fora da lista", () => {
    const setCond = vi.fn();
    abrir(setCond);
    fireEvent.change(screen.getByLabelText(rotulo("Tipo de chanfro")), { target: { value: "K" } });
    expect(setCond.mock.calls.at(-1)[0]({})).toEqual({ chanfro: "K" });
  });
});
