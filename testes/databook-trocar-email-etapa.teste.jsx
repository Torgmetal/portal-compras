// @vitest-environment jsdom
// O formulário que troca o e-mail de uma etapa do fluxo de assinaturas do Data Book (Vitor,
// 06/10/2026: o inspetor estava com o e-mail do Alexandre Stival e não havia como trocar).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import TrocarEmailEtapa, { mensagemDaTroca } from "@/app/qualidade/data-books/[id]/TrocarEmailEtapa";

const inspetor = { ordem: 2, papel: "INSPETOR", nome: "Alexandre Stival", email: "alexandre_stival@yahoo.com.br", status: "PENDENTE" };

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, mudou: true, reenviado: false, enviado: null }) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("formulário", () => {
  it("vem preenchido com o e-mail e o nome atuais e manda a troca para a rota", async () => {
    const onTrocado = vi.fn();
    render(<TrocarEmailEtapa dataBookId="db" etapa={inspetor} onTrocado={onTrocado} onCancelar={() => {}} />);
    const email = screen.getByLabelText("Novo e-mail — Inspetor responsável");
    expect(email.value).toBe("alexandre_stival@yahoo.com.br");
    expect(screen.getByLabelText("Nome — Inspetor responsável").value).toBe("Alexandre Stival");
    fireEvent.change(email, { target: { value: " insp.novo@torg.com.br " } });
    fireEvent.change(screen.getByLabelText("Nome — Inspetor responsável"), { target: { value: "Inspetor Novo" } });
    fireEvent.click(screen.getByText("Salvar e-mail"));
    await waitFor(() => expect(onTrocado).toHaveBeenCalled());
    const [url, opcoes] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/qualidade/data-books/db/assinaturas");
    expect(opcoes.method).toBe("PATCH");
    expect(JSON.parse(opcoes.body)).toEqual({ ordem: 2, email: "insp.novo@torg.com.br", nome: "Inspetor Novo" });
  });

  it("e-mail inválido não sai da tela", () => {
    render(<TrocarEmailEtapa dataBookId="db" etapa={inspetor} onTrocado={() => {}} onCancelar={() => {}} />);
    fireEvent.change(screen.getByLabelText("Novo e-mail — Inspetor responsável"), { target: { value: "sem-arroba" } });
    fireEvent.click(screen.getByText("Salvar e-mail"));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/e-mail válido/)).toBeTruthy();
  });

  it("o responsável técnico troca só o e-mail (o nome é fixo)", async () => {
    const rt = { ordem: 3, papel: "RESP_TECNICO", nome: "Guilherme A. Corte Campos", email: "vitor@torg.com.br", status: "PENDENTE" };
    render(<TrocarEmailEtapa dataBookId="db" etapa={rt} onTrocado={() => {}} onCancelar={() => {}} />);
    expect(screen.queryByLabelText(/^Nome/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Novo e-mail — Responsável técnico"), { target: { value: "guilherme@torg.com.br" } });
    fireEvent.click(screen.getByText("Salvar e-mail"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ ordem: 3, email: "guilherme@torg.com.br" });
  });

  it("erro da rota aparece no formulário", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: "Etapa já assinada — o e-mail não muda depois da assinatura." }) });
    const onTrocado = vi.fn();
    render(<TrocarEmailEtapa dataBookId="db" etapa={inspetor} onTrocado={onTrocado} onCancelar={() => {}} />);
    fireEvent.change(screen.getByLabelText("Novo e-mail — Inspetor responsável"), { target: { value: "outro@torg.com.br" } });
    fireEvent.click(screen.getByText("Salvar e-mail"));
    expect(await screen.findByText(/já assinada/)).toBeTruthy();
    expect(onTrocado).not.toHaveBeenCalled();
  });
});

describe("o que a tela diz depois", () => {
  it("convite reenviado na hora", () => {
    expect(mensagemDaTroca({ mudou: true, reenviado: true, enviado: true }, "a@b.com")).toMatch(/enviado para a@b\.com.*anterior deixou de valer/);
  });
  it("reenvio falhou: manda usar o reenviar", () => {
    expect(mensagemDaTroca({ mudou: true, reenviado: true, enviado: false }, "a@b.com")).toMatch(/reenviar/);
  });
  it("etapa ainda não convidada: o convite sai quando chegar a vez", () => {
    expect(mensagemDaTroca({ mudou: true, reenviado: false }, "a@b.com")).toMatch(/quando chegar a vez/);
  });
  it("nada mudou", () => {
    expect(mensagemDaTroca({ mudou: false }, "a@b.com")).toMatch(/já era/);
  });
});
