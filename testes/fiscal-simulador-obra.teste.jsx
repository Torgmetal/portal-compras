// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import SimuladorObra from "@/app/fiscal/inteligencia/SimuladorObra";

const REC = { id: "r1", descricao: "TRELICA - [NCM: 84313900]", cfop: null, ncm: "84313900", valor: 1000,
  pct: { icms: 12, ipi: 0, pis: 1.65, cofins: 7.6, iss: null, irrf: 3, csll: 1.08 } };

beforeEach(() => {
  global.fetch = vi.fn(async (url, opt) => {
    if (!opt) return { json: async () => ({ success: true, receitas: String(url).includes("vazia") ? [] : [REC] }) };
    return { status: 200, json: async () => ({ success: true, obra: { numero: "105", cliente: "TMSA", uf: "RS" }, ncm: "84313900", cfop: "6101", total: 50,
      linhas: [{ tributo: "IPI", cadastrado: 0, regra: 5, valor: 50, divergente: true, nota: null }] }) };
  });
});
afterEach(() => cleanup());

const abrir = (id = "op1") => {
  render(<SimuladorObra ops={[{ id, numero: "105", cliente: "TMSA", clienteUF: "RS" }]} />);
  fireEvent.change(screen.getByLabelText("Obra"), { target: { value: id } });
};

describe("Simulador pela obra", () => {
  it("escolher a linha preenche NCM (do texto) e valor", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("radio"));
    expect(screen.getByLabelText("NCM").value).toBe("84313900");
    expect(screen.getByLabelText("Valor (R$)").value).toBe("1000");
  });

  it("⚠ linha sem CFOP bloqueia o envio — não se adivinha CFOP", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("radio"));
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/Escolha o CFOP/);
    expect(global.fetch.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
  });

  it("divergência Comercial × regra aparece marcada", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("radio"));
    fireEvent.change(screen.getByLabelText("CFOP"), { target: { value: "6101" } });
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
    await waitFor(() => expect(screen.getByLabelText("diverge")).toBeTruthy());
    const post = global.fetch.mock.calls.find(([, o]) => o?.method === "POST");
    expect(JSON.parse(post[1].body)).toMatchObject({ opId: "op1", receitaId: "r1", ncm: "84313900", cfop: "6101", valor: 1000 });
  });

  it("obra sem receita avisa que é só pela regra", async () => {
    abrir("vazia");
    expect(await screen.findByText(/Sem imposto cadastrado pelo Comercial/)).toBeTruthy();
  });
});

// Achado do Codex (28/09/2026): a resposta de uma simulação da obra A reaparecia depois de trocar
// para a obra B — os seletores continuam livres durante o POST.
describe("⚠ resposta atrasada de uma seleção antiga não aparece", () => {
  const OPS = [{ id: "opA", numero: "105", cliente: "TMSA", clienteUF: "RS" }, { id: "opB", numero: "085", cliente: "DANPOWER", clienteUF: "SP" }];
  let soltar;
  beforeEach(() => {
    global.fetch = vi.fn((url, opt) => {
      if (!opt) return Promise.resolve({ json: async () => ({ success: true, receitas: [{ ...REC, cfop: "6101" }, { ...REC, id: "r2", descricao: "COBERTURA", cfop: "6101" }] }) });
      return new Promise((r) => { soltar = () => r({ status: 200, json: async () => ({ success: true, obra: { numero: "105" }, total: 50,
        linhas: [{ tributo: "IPI", cadastrado: 0, regra: 5, valor: 50, divergente: true, nota: null }] }) }); });
    });
  });

  const simularNaObraA = async () => {
    render(<SimuladorObra ops={OPS} />);
    fireEvent.change(screen.getByLabelText("Obra"), { target: { value: "opA" } });
    fireEvent.click((await screen.findAllByRole("radio"))[0]);
    fireEvent.click(screen.getByRole("button", { name: /Simular/ }));
  };

  it("trocar a obra no meio descarta a resposta da anterior", async () => {
    await simularNaObraA();
    fireEvent.change(screen.getByLabelText("Obra"), { target: { value: "opB" } });
    await screen.findAllByRole("radio");
    soltar();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("IPI")).toBeNull();
    expect(screen.getByRole("button", { name: /Simular/ }).disabled).toBe(false);
  });

  it("trocar a linha de receita no meio também descarta", async () => {
    await simularNaObraA();
    fireEvent.click(screen.getAllByRole("radio")[1]);
    soltar();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("IPI")).toBeNull();
  });

  it("sem troca, a resposta aparece", async () => {
    await simularNaObraA();
    soltar();
    expect(await screen.findByText("IPI")).toBeTruthy();
  });
});
