// @vitest-environment jsdom
//
// O bloco da tela de Prazos onde Compras aceita ou recusa a data que o fornecedor propôs.
//
// ⚠⚠ ESTE ARQUIVO EXISTE PORQUE O DESENHO É PARTE DA REGRA. O fluxo inteiro serve para impedir
// que a data de um terceiro mude o prazo sozinha; se a tela disser "previsão atualizada" no lugar
// de "propôs", quem lê conclui que já mudou e ninguém clica em nada — a proposta morre esperando
// e o efeito prático é o mesmo de não ter o fluxo.
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: mocks.showToast }) }));
// ⚠ A partir de 24/09/2026 o bloco lê a sessão: aprovar e recusar são do Compras, e o
// Almoxarifado — que passou a enxergar esta tela para acompanhar a chegada do material — vê a
// proposta sem os botões. Estes testes são o fluxo do COMPRAS; quem cobre o outro lado é
// `testes/prazos-almoxarifado.teste.jsx`.
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { modulos: ["COMPRAS"] } } }) }));

import PropostaDePrazo from "@/app/compras/prazos/PropostaDePrazo";

const PEDIDO = {
  id: "p1", numeroPedido: "1977", fornecedorNome: "SOUFER",
  propostaPendente: {
    id: "prop-1",
    prazo: "2026-11-20T00:00:00.000Z",
    em: "2026-09-18T14:00:00.000Z",
    motivo: "atraso na laminação",
  },
};

const abrir = (pedido = PEDIDO, onDecidido) => render(<PropostaDePrazo pedido={pedido} onDecidido={onDecidido} />);

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, avisoOk: true }) });
});
afterEach(cleanup);

describe("o que a tela diz", () => {
  it("pedido sem proposta não desenha nada", () => {
    const { container } = abrir({ ...PEDIDO, propostaPendente: null });
    expect(container.innerHTML).toBe("");
  });

  // ⚠⚠ "PROPÔS", E A DATA EM UTC. O prazo vem de um `<input type="date">` (meia-noite UTC); no
  // fuso de São Paulo o dia 20 vira 19, e a tela mostraria uma data que ninguém digitou.
  it("diz que ele PROPÔS, com a data que ele digitou", () => {
    abrir();
    expect(screen.getByText(/propôs 20\/11\/2026/)).toBeTruthy();
  });

  it("⚠ deixa claro que o prazo ainda não mudou e o pedido segue cobrável", () => {
    abrir();
    expect(screen.getByText(/só muda se você aprovar/)).toBeTruthy();
    expect(screen.getByText(/segue cobrável/)).toBeTruthy();
  });

  it("mostra o que o fornecedor escreveu", () => {
    abrir();
    expect(screen.getByText(/atraso na laminação/)).toBeTruthy();
  });
});

describe("aprovar", () => {
  it("manda o id da proposta que a tela leu — nunca 'o que estiver lá'", async () => {
    abrir();
    fireEvent.click(screen.getByText(/Aprovar 20\/11\/2026/));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const corpo = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(corpo).toMatchObject({ pedidoId: "p1", propostaId: "prop-1", acao: "aprovar" });
  });

  it("avisa a tela para recarregar depois de decidir", async () => {
    const onDecidido = vi.fn();
    abrir(PEDIDO, onDecidido);
    fireEvent.click(screen.getByText(/Aprovar/));
    await waitFor(() => expect(onDecidido).toHaveBeenCalled());
  });

  it("409 vira mensagem de erro e NÃO recarrega como se tivesse dado certo", async () => {
    const onDecidido = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ error: "A proposta mudou enquanto voce decidia." }) });
    abrir(PEDIDO, onDecidido);
    fireEvent.click(screen.getByText(/Aprovar/));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(expect.stringMatching(/proposta mudou/), "error"));
    expect(onDecidido).not.toHaveBeenCalled();
  });
});

describe("recusar", () => {
  // ⚠ O primeiro clique ABRE o campo de motivo; o segundo confirma. Recusar manda e-mail ao
  // fornecedor — um clique só, sem chance de escrever o porquê, sairia seco.
  it("o primeiro clique pede o motivo, não recusa", () => {
    abrir();
    fireEvent.click(screen.getByText("Recusar"));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/vai no e-mail ao fornecedor/)).toBeTruthy();
    expect(screen.getByText("Confirmar recusa")).toBeTruthy();
  });

  it("confirmando, manda a recusa com o motivo", async () => {
    abrir();
    fireEvent.click(screen.getByText("Recusar"));
    fireEvent.change(screen.getByPlaceholderText(/vai no e-mail ao fornecedor/), {
      target: { value: "a obra não espera" } });
    fireEvent.click(screen.getByText("Confirmar recusa"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body))
      .toMatchObject({ acao: "recusar", motivo: "a obra não espera" });
  });

  // ⚠⚠ A RECUSA VALEU, MAS O FORNECEDOR NÃO SOUBE. Se isso passar como "recusada com sucesso",
  // ele segue achando que a data dele está combinada — que é o problema que a recusa existia para
  // resolver.
  it("⚠⚠ fornecedor sem e-mail avisa quem recusou, em vermelho", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, semEmail: true }) });
    abrir();
    fireEvent.click(screen.getByText("Recusar"));
    fireEvent.click(screen.getByText("Confirmar recusa"));
    await waitFor(() => expect(mocks.showToast)
      .toHaveBeenCalledWith(expect.stringMatching(/não tem e-mail cadastrado/), "error"));
  });

  it("e-mail falhando também avisa quem recusou", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, avisoOk: false }) });
    abrir();
    fireEvent.click(screen.getByText("Recusar"));
    fireEvent.click(screen.getByText("Confirmar recusa"));
    await waitFor(() => expect(mocks.showToast)
      .toHaveBeenCalledWith(expect.stringMatching(/e-mail ao fornecedor falhou/), "error"));
  });
});
