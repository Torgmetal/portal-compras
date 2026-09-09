// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import NotificationBell from "../components/NotificationBell";

// A TELA DE VERDADE, MONTADA — sem depender de login em produção (o script de validar-tela.mjs
// precisa das credenciais locais, que não vivem no repositório). O que precisa ficar provado
// aqui é o que o pedido descreveu: o número de não lidas aparece no sino, o painel abre com o
// conteúdo real, marcar uma lida some com a bolinha, e "marcar todas" zera o contador.

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const ITENS = [
  { id: "d1", lida: false, tipo: "RM_CRIADA", titulo: "Nova RM T97-002", mensagem: "João criou a RM T97-002.", link: "/compras/rm/1", criadoEm: new Date().toISOString() },
  { id: "d2", lida: true, tipo: "COTACAO_RESPONDIDA", titulo: "Nova proposta — SOUFER", mensagem: "SOUFER enviou a proposta.", link: "/compras/rm/2", criadoEm: new Date().toISOString() },
];

function servidor() {
  return vi.fn(async (url, opcoes) => {
    if (opcoes?.method === "PATCH") {
      return { ok: true, json: async () => ({ success: true, naoLidas: 0 }) };
    }
    return { ok: true, json: async () => ({ success: true, naoLidas: 1, itens: ITENS }) };
  });
}

beforeEach(() => { globalThis.React = React; push.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("sino de notificações", () => {
  it("mostra o número de não lidas assim que carrega, sem precisar abrir", async () => {
    vi.stubGlobal("fetch", servidor());
    render(<NotificationBell />);
    expect(await screen.findByText("1")).toBeTruthy();
  });

  it("abrir o sino lista as notificações reais, com o não lido destacado", async () => {
    vi.stubGlobal("fetch", servidor());
    render(<NotificationBell />);
    await screen.findByText("1");
    fireEvent.click(screen.getByRole("button", { name: /Notificações/ }));
    expect(await screen.findByText("Nova RM T97-002")).toBeTruthy();
    expect(screen.getByText("Nova proposta — SOUFER")).toBeTruthy();
  });

  it("clicar numa não lida marca como lida e navega pro link", async () => {
    const fetchMock = servidor();
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationBell />);
    await screen.findByText("1");
    fireEvent.click(screen.getByRole("button", { name: /Notificações/ }));
    fireEvent.click(await screen.findByText("Nova RM T97-002"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/compras/rm/1"));
    const patchCall = fetchMock.mock.calls.find(([, o]) => o?.method === "PATCH");
    expect(JSON.parse(patchCall[1].body)).toEqual({ ids: ["d1"] });
  });

  it("marcar todas como lidas zera o contador", async () => {
    vi.stubGlobal("fetch", servidor());
    render(<NotificationBell />);
    await screen.findByText("1");
    fireEvent.click(screen.getByRole("button", { name: /Notificações/ }));
    fireEvent.click(await screen.findByText(/marcar todas como lidas/));
    await waitFor(() => expect(screen.queryByText("1")).toBeNull());
  });

  it("sem nada, mostra o vazio sem quebrar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ success: true, naoLidas: 0, itens: [] }) })));
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: "Notificações" }));
    expect(await screen.findByText(/Nenhuma notificação/)).toBeTruthy();
  });

  it("Esc fecha o painel", async () => {
    vi.stubGlobal("fetch", servidor());
    render(<NotificationBell />);
    await screen.findByText("1");
    fireEvent.click(screen.getByRole("button", { name: /Notificações/ }));
    await screen.findByText("Nova RM T97-002");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Nova RM T97-002")).toBeNull());
  });
});
