// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ⚠⚠ Matheus (26/09/2026): "a aba Inteligência está muito complexa com muitas funções". Ficam 4 abas
// do dia a dia; o resto vai para Administração, só ADMIN. A tela abre no Simulador.
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));
vi.mock("@/components/fiscal/assistente/AssistenteFiscal", () => ({ default: () => <div>assistente-aqui</div> }));
vi.mock("@/app/fiscal/inteligencia/AbaClassificacoes", () => ({ default: () => <div>classificacoes-aqui</div> }));
vi.mock("@/app/fiscal/inteligencia/AbaCadeia", () => ({ default: () => <div>cadeia-aqui</div> }));
vi.mock("@/app/fiscal/inteligencia/AbaRegras", () => ({ default: () => <div>regras-aqui</div> }));
vi.mock("@/app/fiscal/inteligencia/SimuladorObra", () => ({ default: () => <div>simulador-obra-aqui</div> }));

const { default: Cliente } = await import("@/app/fiscal/inteligencia/InteligenciaFiscalClient");
const props = { referencia: null, cfops: [], operacoes: [], cstIpi: [], familias: [] };

beforeEach(() => { global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, ops: [], cfops: [], pares: [], familias: [], cstIpi: [], operacoes: [], medicoes: [] }) })); });
afterEach(() => cleanup());

const rotulos = () => screen.getAllByRole("tab").map((b) => b.textContent);

describe("abas da Inteligência Fiscal", () => {
  it("quem não é ADMIN vê só as 4 do dia a dia", () => {
    render(<Cliente {...props} ehAdmin={false} />);
    expect(rotulos()).toEqual(["Simulador", "Auditoria de medição", "Consulta NCM/CFOP", "Assistente Fiscal"]);
  });
  it("ADMIN vê também Administração, com as abas antigas dentro", () => {
    render(<Cliente {...props} ehAdmin />);
    expect(rotulos()).toContain("Administração");
    fireEvent.click(screen.getByRole("tab", { name: "Administração" }));
    fireEvent.click(screen.getByRole("button", { name: "Cadeia de documentos" }));
    expect(screen.getByText("cadeia-aqui")).toBeTruthy();
  });
  it("abre no Simulador", () => {
    render(<Cliente {...props} ehAdmin={false} />);
    expect(screen.getByRole("tab", { name: "Simulador" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("simulador-obra-aqui")).toBeTruthy();
  });
});
