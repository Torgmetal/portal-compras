// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import Painel from "@/components/producao/ProducaoOperacional";
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));
vi.mock("@/components/FichaPecaModal", () => ({
  default: ({ marca }) => <div>Ficha {marca}</div>,
}));
vi.mock("@/components/DesenhoPecaModal", () => ({ default: () => null }));
const ops = [
  {
    opId: "a",
    opNumero: "112",
    cliente: "Cliente A",
    obra: "Obra A",
    pecas: { total: 1 },
    setores: [{ setor: "CORTE", pendenteUn: 12 }],
    alertas: [],
  },
  {
    opId: "b",
    opNumero: "113",
    cliente: "Cliente B",
    pecas: { total: 1 },
    setores: [],
    alertas: [],
  },
];
beforeEach(() => {
  globalThis.React = React;
  window.scrollTo = vi.fn();
  globalThis.fetch = vi.fn(async (url) => ({
    ok: true,
    json: async () =>
      String(url).includes("/producao?")
        ? { ops }
        : String(url).includes("/producao/expedicao?")
          ? { romaneios: [], paginas: 1 }
          : String(url).includes("opId=b")
            ? { pecas: [{ id: "b1", marca: "MARCA-B", qte: 4 }] }
            : {
                pecas: [
                  {
                    id: "a1",
                    marca: "MARCA-A",
                    qte: 20,
                    produzidoSyneco: 8,
                    baixadoQtd: 5,
                    programacao: { situacao: "INICIADA" },
                  },
                ],
              },
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("abre peças da etapa com saldo real, permite filtro e troca de OP sem manter peças antigas", async () => {
  render(<Painel />);
  fireEvent.click(await screen.findByRole("button", { name: "OP 112" }));
  expect(await screen.findByRole("button", { name: "MARCA-A" })).toBeTruthy();
  expect(screen.getByText("Saldo: 12 un.")).toBeTruthy();
  fireEvent.change(
    screen.getByRole("combobox", { name: "Situação das peças" }),
    { target: { value: "CONCLUIDA" } },
  );
  expect(screen.queryByRole("button", { name: "MARCA-A" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Trocar OP" }), {
    target: { value: "b" },
  });
  expect(screen.queryByRole("button", { name: "MARCA-A" })).toBeNull();
  expect(await screen.findByRole("button", { name: "MARCA-B" })).toBeTruthy();
});
it("faz baixa somente depois da quantidade e confirmação explícitas", async () => {
  render(<Painel />);
  fireEvent.click(await screen.findByRole("button", { name: "OP 113" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Registrar quantidade" }),
  );
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Quantidade concluída de MARCA-B" }),
    { target: { value: "3" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Revisar e salvar" }));
  expect(fetch.mock.calls.every((c) => c[1]?.method !== "POST")).toBe(true);
  fetch.mockImplementationOnce(async () => ({
    ok: true,
    json: async () => ({ atualizados: 1 }),
  }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar quantidade" }));
  await waitFor(() =>
    expect(fetch.mock.calls.some((c) => c[1]?.method === "POST")).toBe(true),
  );
  const body = JSON.parse(
    fetch.mock.calls.find((c) => c[1]?.method === "POST")[1].body,
  );
  expect(body).toEqual({ baixaSetor: "CORTE", baixas: [{ id: "b1", qtd: 3 }] });
  expect(await screen.findByText("Saldo: 1 un.")).toBeTruthy();
});
it("reverte a baixa ao informar total zero", async () => {
  render(<Painel />);
  fireEvent.click(await screen.findByRole("button", { name: "OP 113" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Registrar quantidade" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Revisar e salvar" }));
  fetch.mockImplementationOnce(async () => ({
    ok: true,
    json: async () => ({ atualizados: 1 }),
  }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar quantidade" }));
  await waitFor(() =>
    expect(fetch.mock.calls.some((c) => c[1]?.method === "POST")).toBe(true),
  );
  expect(
    JSON.parse(fetch.mock.calls.find((c) => c[1]?.method === "POST")[1].body),
  ).toEqual({ baixaSetor: "CORTE", reverterBaixa: true, ids: ["b1"] });
});
it("permite consultar uma OP encerrada fora da carteira sem registrar quantidade", async () => {
  const anterior = fetch.getMockImplementation();
  fetch.mockImplementation((url, ...args) =>
    String(url) === "/api/producao/ops"
      ? Promise.resolve({
          ok: true,
          json: async () => ({
            ops: [
              {
                opId: "hist",
                opNumero: "080",
                cliente: "Histórico",
                status: "ENCERRADA",
              },
            ],
          }),
        })
      : anterior(url, ...args),
  );
  render(<Painel inicial="expedicao" />);
  fireEvent.click(await screen.findByRole("button", { name: "OP 080" }));
  fireEvent.click(screen.getByRole("tab", { name: "Peças e execução" }));
  expect(await screen.findByRole("button", { name: "MARCA-A" })).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Registrar quantidade" }),
  ).toBeNull();
  expect(screen.getByText(/Consulta histórica. Os apontamentos/)).toBeTruthy();
});
