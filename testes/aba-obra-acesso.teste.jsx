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
