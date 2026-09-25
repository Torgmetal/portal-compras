// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ⚠⚠ A QUARTA OPÇÃO NÃO É UMA ETAPA, e é isso que estes testes guardam: ela vai para OUTRA rota,
// muda a PREVISÃO e não registra que o material chegou. Trocar o destino por engano faria o
// comprador achar que remarcou o prazo enquanto gravava um acontecimento que não houve.

const sessao = { data: null };
vi.mock("next-auth/react", () => ({ useSession: () => sessao }));

const { AcompanhamentoPedido } = await import("@/app/compras/rm/[id]/_componentes/AcompanhamentoPedido");

const PEDIDO = {
  // ⚠ Prazo num ano que nunca é "hoje": com 25/09/2026 aqui, o teste que exige "não é hoje" quebrou
  // exatamente em 25/09/2026.
  id: "p1", fornecedorNome: "A2 METAIS", numeroPedido: "2069", createdAt: "2026-09-01T00:00:00.000Z",
  prazoEntregaPrevisto: "2099-03-17T00:00:00.000Z", prazoOriginal: null,
  prazoHistorico: [], acompanhamentos: [], cotacao: null,
  prazoProposto: null, prazoPropostoEm: null, prazoPropostoId: null,
};

const comprador = () => { sessao.data = { user: { tipo: "USUARIO", modulos: ["COMPRAS"] } }; };
const almoxarife = () => { sessao.data = { user: { tipo: "USUARIO", modulos: ["ALMOXARIFADO"] } }; };

const abrir = (pedido = PEDIDO) => {
  const r = render(<AcompanhamentoPedido pedido={pedido} aoMudar={() => {}} />);
  // ⚠ O bloco nasce RECOLHIDO de propósito (pedido do Matheus em 16/09: "não altere nada do que
  // existe hoje na tela"). O teste abre como a pessoa abre, pelo botão da régua.
  const abre = r.container.querySelector("button");
  if (abre && !screen.queryByRole("combobox")) fireEvent.click(abre);
};

afterEach(() => cleanup());

beforeEach(() => {
  comprador();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
});

describe("a opção Data de entrega no lançamento do pedido", () => {
  it("aparece para quem tem o módulo COMPRAS", () => {
    abrir();
    expect(screen.getByRole("option", { name: /Data de entrega \(previsão\)/i })).toBeTruthy();
  });

  // ⚠⚠ A ROTA DE PRAZO EXIGE ADMIN OU COMPRAS; a de etapa aceita ALMOXARIFADO. Oferecer a opção a
  // quem não pode faria o almoxarife escolher e tomar um 403 sem entender por quê.
  it("NÃO aparece para o almoxarifado, que pode lançar etapa mas não remarcar prazo", () => {
    almoxarife();
    abrir();
    expect(screen.queryByRole("option", { name: /Data de entrega/i })).toBeNull();
    expect(screen.getByRole("option", { name: /Material recebido/i })).toBeTruthy();
  });

  it("as três etapas continuam onde estavam", () => {
    abrir();
    for (const r of [/Liberado para coleta/i, /Encaminhado para obra/i, /Material recebido/i]) {
      expect(screen.getByRole("option", { name: r })).toBeTruthy();
    }
  });

  it("escolher a previsão manda para a rota de PRAZO, não para a de acompanhamento", async () => {
    abrir();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__PREVISAO__" } });
    fireEvent.click(screen.getByRole("button", { name: /Lançar/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, opcoes] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/compras/entregas/prazo");
    expect(opcoes.method).toBe("PATCH");
    expect(JSON.parse(opcoes.body)).toMatchObject({ pedidoId: "p1", novoPrazo: "2099-03-17" });
  });

  it("uma etapa comum continua indo para a rota de acompanhamento", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Lançar/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch.mock.calls[0][0]).toBe("/api/pedido-omie/p1/acompanhamento");
  });

  // ⚠⚠⚠ HOJE É O PALPITE CERTO PARA UM FATO DO PASSADO E O ERRADO PARA UMA PREVISÃO: deixado ali,
  // grava sem querer um prazo para hoje, que joga o pedido em "vence hoje" e dispara cobrança em
  // cima de um fornecedor que não combinou nada disso.
  it("trocar para previsão troca a data padrão para o prazo atual, não para hoje", async () => {
    abrir();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__PREVISAO__" } });
    fireEvent.click(screen.getByRole("button", { name: /Lançar/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const enviado = JSON.parse(global.fetch.mock.calls[0][1].body).novoPrazo;
    expect(enviado).toBe("2099-03-17");
    expect(enviado).not.toBe(new Date().toISOString().slice(0, 10));
  });

  it("a observação vira o MOTIVO da remarcação", async () => {
    abrir();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__PREVISAO__" } });
    fireEvent.change(screen.getByPlaceholderText(/Observação/i), { target: { value: "fornecedor pediu mais 5 dias" } });
    fireEvent.click(screen.getByRole("button", { name: /Lançar/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).motivo).toBe("fornecedor pediu mais 5 dias");
  });

  // ⚠⚠ REMARCAR POR DENTRO DESCARTA A PROPOSTA DO FORNECEDOR — quem remarca talvez nem saiba que
  // ela existe. A rota já mata a proposta; o que faltava era AVISAR.
  it("avisa que a proposta pendente do fornecedor será descartada", () => {
    abrir({ ...PEDIDO, prazoProposto: "2026-10-02T00:00:00.000Z", prazoPropostoId: "v1" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__PREVISAO__" } });
    expect(screen.getByText(/proposta dele/i)).toBeTruthy();
  });

  it("e diz, sempre, que isto não registra que o material chegou", () => {
    abrir();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__PREVISAO__" } });
    expect(screen.getByText(/não registra que o material chegou/i)).toBeTruthy();
  });
});
