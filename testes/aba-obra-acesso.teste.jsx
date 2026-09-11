// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AbaObra from "@/app/comercial/[id]/AbaObra";

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ itens: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const op = { id: "op1", numero: "001", cliente: "Cliente", valorTotalContrato: 5754 };
it("não exibe o valor do contrato na aba Obra nem para Comercial", () => {
  render(<AbaObra op={op} podeGerenciarComercial />);
  expect(screen.queryByText("Valor do contrato")).toBeNull();
});
it("oculta orçamento por padrão e não consulta pastas comerciais", () => {
  render(<AbaObra op={op} />);
  expect(screen.queryByText("Orçamento do Comercial")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("não exibe orçamento nem consulta pastas mesmo com permissão comercial", () => {
  render(<AbaObra op={op} podeGerenciarComercial />);
  expect(screen.queryByText("Orçamento do Comercial")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("mostra endereço do cliente e de entrega separados para qualquer usuário", () => {
  render(<AbaObra op={{ ...op, clienteEndereco: "Rua do Cliente, 10", clienteCidade: "Conchal", clienteUF: "SP", clienteCep: "13835-000", kickoff: { entregaEndereco: "Portaria 2\nRua da Obra, 200 — Itaguaí/RJ" } }} />);
  expect(screen.getByText("Endereço do cliente")).toBeTruthy();
  expect(screen.getByText("Rua do Cliente, 10 · Conchal · SP · 13835-000")).toBeTruthy();
  expect(screen.getByText("Endereço de entrega")).toBeTruthy();
  expect(screen.getByText(/Portaria 2/)).toBeTruthy();
});
it("indica entrega não informada sem repetir o endereço fiscal", () => {
  render(<AbaObra op={{ ...op, clienteEndereco: "Rua Fiscal, 10" }} />);
  const campo = screen.getByText("Endereço de entrega").parentElement;
  expect(campo.textContent).toContain("Não informado");
  expect(campo.textContent).not.toContain("Rua Fiscal");
});
