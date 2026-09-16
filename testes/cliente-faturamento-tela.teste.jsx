// @vitest-environment jsdom
// A aba "Pedidos de compra e faturamento" renderiza o que a API devolve — cada dinheiro na sua
// coluna, notas numa linha própria, texto para o cliente (16/09/2026).
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }) => <a href={href}>{children}</a> }));
import FaturamentoClienteClient from "@/app/cliente/faturamento/FaturamentoClienteClient";

const resposta = {
  email: "jose.neto@tmsa.ind.br", como: true, sincronizadoEm: "2026-09-16T07:01:12.516Z",
  totais: { pedidos: 2, contratado: 747948.13, faturado: 487255.86, aFaturar: 260692.27, vencido: 260692.27 },
  obras: [
    { opNumero: "089", obra: "TERMASA", cliente: "TMSA", projetos: [], pctFaturado: 46, totais: { pedidos: 1, contratado: 482864.31, faturado: 222172.04, aFaturar: 260692.27, vencido: 260692.27 },
      linhas: [{ oc: null, rotulo: "OC", descricao: "Armacao de Estruturas Metalicas", referenciaNF: null, itens: [], tags: [], aditivo: null, contratado: 482864.31, faturado: 222172.04, aFaturar: 260692.27, origem: "OMIE",
        situacao: { codigo: "VENCIDO", rotulo: "Parcial · saldo vencido" }, proximaPrevisao: "2026-09-04", vencidaDesde: "2026-09-04", canceladas: 1,
        pedidosOmie: [{ numero: "235" }], notas: [{ data: "2026-09-04", valor: 88189.59 }, { data: "2026-09-10", valor: 34752.85 }],
        avisos: ["A Torg ainda não registrou o número da sua OC neste pedido; o valor e as notas estão corretos."] }] },
    { opNumero: "103", obra: "Torocua", cliente: "TMSA", projetos: [], pctFaturado: 100, totais: { pedidos: 1, contratado: 265083.82, faturado: 265083.82, aFaturar: 0, vencido: 0 },
      linhas: [{ oc: "OC228351-1", rotulo: "OC", descricao: "Estruturas pré-fabricadas", itens: [], tags: [], aditivo: null, contratado: 265083.82, faturado: 265083.82, aFaturar: 0, origem: "OMIE", situacao: { codigo: "FATURADO", rotulo: "Faturado" }, proximaPrevisao: null, vencidaDesde: null, canceladas: 0, pedidosOmie: [{ numero: "287" }], notas: [{ data: "2026-09-14", valor: 222983.04 }], avisos: [] }] },
  ],
};

beforeEach(() => { globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => resposta })); });
afterEach(() => cleanup());

it("mostra contratado, faturado e a faturar em colunas separadas, as notas e o aviso em linguagem de cliente", async () => {
  render(<FaturamentoClienteClient como="jose.neto@tmsa.ind.br" />);
  await waitFor(() => expect(screen.getByText("OP-089 · TERMASA")).toBeTruthy());
  expect(screen.getByText("Pedido nº 235")).toBeTruthy();
  expect(screen.getByText("OC não informada")).toBeTruthy();
  expect(screen.getAllByText("Saldo vencido").length).toBeGreaterThanOrEqual(2); // cartão + situação
  expect(screen.getByText("2 notas emitidas")).toBeTruthy();
  expect(screen.getByText(/A Torg ainda não registrou o número da sua OC/)).toBeTruthy();
  expect(screen.getByText("OC 228351-1")).toBeTruthy();
  expect(screen.getAllByText("Faturado").length).toBeGreaterThan(0);
  expect(document.body.textContent).not.toMatch(/Omie/);
});

it("sem acesso, explica e não mostra valores", async () => {
  globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ error: "Esta área não está liberada para o seu acesso.", temAcesso: false }) }));
  render(<FaturamentoClienteClient />);
  await waitFor(() => expect(screen.getByText("Esta área não está liberada para o seu acesso.")).toBeTruthy());
  expect(screen.queryByText(/R\$/)).toBeNull();
});
