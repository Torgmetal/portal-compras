// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import SessaoClient from "../app/expedicao/conferencia/[id]/SessaoClient";

// A TELA DE CAMPO, MONTADA. O que precisa ficar provado aqui é o que a pessoa VÊ com o celular na
// mão: a recusa aparece grande e legível, o que ela digitou não some junto com o erro, e o saldo
// que aparece é o que o servidor devolveu — nunca um número que o navegador somou sozinho.

vi.mock("next/link", () => ({ default: ({ children, ...p }) => <a {...p}>{children}</a> }));

const MARCAS = [
  { marca: "T97A140", descricao: "TRAVAMENTO EL.9325", previsto: 2, conferido: 0, saldo: 2, completa: false },
  { marca: "T97A180", descricao: "VIGA EL.10250", previsto: 5, conferido: 5, saldo: 0, completa: true },
];
const estado = (over = {}) => ({
  success: true,
  conferencia: { id: "c1", status: "ABERTA", opNumero: "097" },
  op: { numero: "097", cliente: "MEGASTEAM", obra: "Unipar" },
  marcas: MARCAS,
  lancamentos: [],
  progresso: { previsto: 7, conferido: 5, marcasCompletas: 1, marcasTotal: 2, pct: 71 },
  ...over,
});

/** o fetch: GET devolve o estado; POST devolve o que o teste mandar */
function servidor({ aoLancar } = {}) {
  return vi.fn(async (url, opcoes) => {
    if (!opcoes || opcoes.method === undefined) {
      return { ok: true, status: 200, text: async () => JSON.stringify(estado()) };
    }
    if (opcoes.method === "POST") return aoLancar(JSON.parse(opcoes.body));
    return { ok: true, status: 200, text: async () => JSON.stringify(estado()) };
  });
}

const ok = (over) => ({ ok: true, status: 200, text: async () => JSON.stringify(estado(over)) });
const recusa = (msg) => ({ ok: false, status: 409, text: async () => JSON.stringify({ error: msg, recusado: true }) });

const abrir = async () => {
  render(<SessaoClient id="c1" />);
  await screen.findByText(/MEGASTEAM/);
};
const digitar = (rotulo, valor) => fireEvent.change(screen.getByPlaceholderText(rotulo), { target: { value: valor } });

beforeEach(() => { globalThis.React = React; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("conferência no celular", () => {
  it("mostra a obra e o andamento vindos do servidor", async () => {
    vi.stubGlobal("fetch", servidor());
    await abrir();
    expect(screen.getByText(/OP-097/)).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();          // conferidas
    expect(screen.getByText(/de 7 peças/)).toBeTruthy();
  });

  // ⚠⚠ O CASO DO PEDIDO: a mensagem de recusa tem que aparecer, e aparecer inteira.
  it("a recusa do servidor vira aviso na tela", async () => {
    const msg = "T97A140: a Lista de Expedição tem 2 peças e você já conferiu 2. Essa marca está completa.";
    vi.stubGlobal("fetch", servidor({ aoLancar: async () => recusa(msg) }));
    await abrir();
    digitar("Digite parte da marca", "T97A140");
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Lançar conferência/ }));
    expect(await screen.findByText(msg)).toBeTruthy();
  });

  // ⚠ limpar num erro apagaria o que a pessoa digitou junto com o aviso que explica o erro.
  it("o que foi digitado continua na tela depois da recusa", async () => {
    vi.stubGlobal("fetch", servidor({ aoLancar: async () => recusa("não cabe") }));
    await abrir();
    digitar("Digite parte da marca", "T97A140");
    fireEvent.click(screen.getByRole("button", { name: /Lançar conferência/ }));
    await screen.findByText("não cabe");
    expect(screen.getByPlaceholderText("Digite parte da marca").value).toBe("T97A140");
  });

  it("lançamento aceito limpa o formulário e confirma", async () => {
    vi.stubGlobal("fetch", servidor({
      aoLancar: async () => ok({ lancamentos: [{ id: "i1", marca: "T97A140", qte: 1, criadoEm: new Date().toISOString() }] }),
    }));
    await abrir();
    digitar("Digite parte da marca", "T97A140");
    fireEvent.click(screen.getByRole("button", { name: /Lançar conferência/ }));
    await waitFor(() => expect(screen.getByText(/conferida\(s\)/)).toBeTruthy());
    expect(screen.getByPlaceholderText("Digite parte da marca").value).toBe("");
  });

  it("o autocomplete mostra o saldo de cada marca e preenche a quantidade", async () => {
    vi.stubGlobal("fetch", servidor());
    await abrir();
    fireEvent.focus(screen.getByPlaceholderText("Digite parte da marca"));
    expect(await screen.findByText("faltam 2")).toBeTruthy();
    expect(screen.getByText("completa")).toBeTruthy();
    fireEvent.click(screen.getByText("T97A140"));
    await waitFor(() => expect(screen.getByPlaceholderText("Digite parte da marca").value).toBe("T97A140"));
  });

  // ⚠⚠ Matheus (08/09/2026): "quando eu selecionar a MARCA não deve preencher a quantidade total
  // automática, deve vir com 1 por padrão". Preencher com o saldo transforma CONTAR em CONFIRMAR:
  // um toque daria por conferidas 10 peças que ninguém olhou, com o número vindo da própria lista
  // que a conferência existe para checar.
  it("escolher a marca NÃO preenche a quantidade — fica 1", async () => {
    vi.stubGlobal("fetch", servidor());
    await abrir();
    fireEvent.focus(screen.getByPlaceholderText("Digite parte da marca"));
    fireEvent.click(await screen.findByText("T97A140"));   // faltam 2
    await waitFor(() => expect(screen.getByPlaceholderText("Digite parte da marca").value).toBe("T97A140"));
    expect(screen.getByDisplayValue("1")).toBeTruthy();
    expect(screen.queryByDisplayValue("2")).toBeNull();
  });

  it("a aba da lista mostra a L.E. com o que falta", async () => {
    vi.stubGlobal("fetch", servidor());
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: /Lista da obra \(2\)/ }));
    expect(await screen.findByText("0/2")).toBeTruthy();
    // "só pendentes" é o padrão: a marca completa não aparece
    expect(screen.queryByText("5/5")).toBeNull();
  });

  it("conferência encerrada não mostra o formulário", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify(estado({ conferencia: { id: "c1", status: "FINALIZADA", opNumero: "097" } })),
    })));
    await abrir();
    expect(screen.queryByRole("button", { name: /Lançar conferência/ })).toBeNull();
    expect(screen.getByText(/foi encerrada/)).toBeTruthy();
  });
});
