// @vitest-environment jsdom
// Achado do Codex (28/09/2026): o POST que reconstrói as regras de IBS/CBS existia, mas nenhum botão
// o chamava — a carga do ano só dava para fazer por script.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import AtualizarRegrasNf from "@/app/fiscal/inteligencia/AtualizarRegrasNf";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const resposta = (status, corpo) => ({ ok: status < 400, status, json: async () => corpo });

describe("Atualizar regras das NFs", () => {
  it("chama o POST, mostra o andamento e o resultado", async () => {
    let soltar;
    global.fetch = vi.fn(() => new Promise((r) => { soltar = r; }));
    render(<AtualizarRegrasNf />);
    fireEvent.click(screen.getByRole("button", { name: /Atualizar regras das NFs/ }));
    expect(global.fetch).toHaveBeenCalledWith("/api/fiscal/inteligencia/regras-ibs-cbs", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("button", { name: /Atualizando/ }).disabled).toBe(true);
    soltar(resposta(200, { success: true, notas: 484, regras: 84 }));
    expect(await screen.findByText(/484 NF\(s\) lidas · 84 regra\(s\)/)).toBeTruthy();
  });

  it("⚠ erro aparece e o botão volta, para tentar de novo", async () => {
    global.fetch = vi.fn(async () => resposta(502, { success: false, error: "Omie ListarNF: HTTP 502." }));
    render(<AtualizarRegrasNf />);
    fireEvent.click(screen.getByRole("button", { name: /Atualizar regras das NFs/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/HTTP 502/);
    await waitFor(() => expect(screen.getByRole("button", { name: /Atualizar regras das NFs/ }).disabled).toBe(false));
    global.fetch = vi.fn(async () => resposta(200, { success: true, notas: 1, regras: 1 }));
    fireEvent.click(screen.getByRole("button", { name: /Atualizar regras das NFs/ }));
    expect(await screen.findByText(/1 NF\(s\) lidas/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("resposta que não é JSON vira mensagem, não tela quebrada", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 504, json: async () => { throw new Error("html"); } }));
    render(<AtualizarRegrasNf />);
    fireEvent.click(screen.getByRole("button", { name: /Atualizar regras das NFs/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/504/);
  });
});
