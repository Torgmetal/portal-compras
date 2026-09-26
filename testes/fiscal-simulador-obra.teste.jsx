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
