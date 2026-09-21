// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import ModalEditarContatosCliente from "@/components/comercial/ModalEditarContatosCliente";
import ObrasDoCliente from "@/app/admin/usuarios/[id]/ObrasDoCliente";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("editar contatos do cliente na OP", () => {
  const iniciais = [{ nome: "Rogério Porsch", email: "rogerio.porsch@tmsa.ind.br", papeis: ["FATURAMENTO"] }];

  it("adiciona um contato e manda a lista completa, com emailAnterior só em quem mudou de e-mail", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, contatos: [] }) });
    const onSaved = vi.fn();
    render(<ModalEditarContatosCliente opId="op122" contatos={iniciais} onClose={() => {}} onSaved={onSaved} />);
    fireEvent.click(screen.getByText("Adicionar contato"));
    fireEvent.change(screen.getByLabelText("Nome do contato 2"), { target: { value: "Elaine Hendler" } });
    fireEvent.change(screen.getByLabelText("E-mail do contato 2"), { target: { value: "Elaine.Hendler@tmsa.ind.br" } });
    fireEvent.change(screen.getByLabelText("Função do contato 2"), { target: { value: "Qualidade" } });
    fireEvent.click(screen.getByText("Salvar contatos"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/comercial/op/op122/contatos");
    expect(opts.method).toBe("PUT");
    const body = JSON.parse(opts.body);
    expect(body.contatos).toEqual([
      { nome: "Rogério Porsch", email: "rogerio.porsch@tmsa.ind.br", funcao: "", telefone: "", celular: "" },
      { nome: "Elaine Hendler", email: "elaine.hendler@tmsa.ind.br", funcao: "Qualidade", telefone: "", celular: "" },
    ]);
  });

  it("não deixa salvar contato sem e-mail — é o e-mail que abre o portal", async () => {
    global.fetch = vi.fn();
    render(<ModalEditarContatosCliente opId="op122" contatos={[]} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText("Adicionar contato"));
    fireEvent.change(screen.getByLabelText("Nome do contato 1"), { target: { value: "Fulano" } });
    fireEvent.click(screen.getByText("Salvar contatos"));
    expect(await screen.findByText(/Informe o e-mail de "Fulano"/)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("obras liberadas de um login de cliente", () => {
  const resposta = {
    usuario: { id: "u9", name: "Rogério", email: "rogerio.porsch@tmsa.ind.br" },
    obras: [
      { id: "op122", numero: "122", cliente: "TMSA", obra: "Vale", status: "EM_EXECUCAO", liberada: true, origem: "contato" },
      { id: "op105", numero: "105", cliente: "TMSA", obra: "Bianchini", status: "ABERTA", liberada: true, origem: "email" },
      { id: "op067", numero: "067", cliente: "DANPOWER", obra: "ENC 326", status: "ABERTA", liberada: false, origem: null },
    ],
  };

  it("marca as liberadas, trava a que vem pelo e-mail da OP, e salva só a lista por contato", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => resposta })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, liberadas: ["067"], revogadas: [], obras: resposta.obras.map((o) => (o.id === "op067" ? { ...o, liberada: true, origem: "contato" } : o)) }) });
    render(<ObrasDoCliente id="u9" />);
    const cb122 = await screen.findByLabelText("Liberar OP-122");
    expect(cb122.checked).toBe(true);
    const cb105 = screen.getByLabelText("Liberar OP-105");
    expect(cb105.checked).toBe(true);
    expect(cb105.disabled).toBe(true);
    const cb067 = screen.getByLabelText("Liberar OP-067");
    expect(cb067.checked).toBe(false);
    fireEvent.click(cb067);
    fireEvent.click(screen.getByText("Salvar obras"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [url, opts] = global.fetch.mock.calls[1];
    expect(url).toBe("/api/admin/usuarios/u9/obras");
    expect(JSON.parse(opts.body).opIds.sort()).toEqual(["op067", "op122"]);
    expect(await screen.findByText(/liberada: OP-067/)).toBeTruthy();
  });
});
