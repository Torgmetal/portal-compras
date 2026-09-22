// @vitest-environment jsdom
//
// O CARTÃO DO RELATÓRIO QUE O CLIENTE SÓ CONSULTA.
//
// ⚠⚠ O QUE ESTE ARQUIVO PEGA é o cartão prometer assinatura a quem não assina: a tarja azul
// "a assinar", o link "abrir para assinar" (que não existe para ele) e a obra somando a leitura
// na conta de pendências. Vitor (22/09/2026): "deixe disponível para ele consultar".
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
import MeuEspacoClient from "@/app/cliente/MeuEspacoClient";

const CONSULTA = {
  titulo: "RPM-105-002 — Inspeção de pré-montagem · OP-105", tipo: "RELATORIO_INSPECAO",
  papel: null, revisao: 0, enviadoEm: "2026-09-21T09:00:00.000Z", assinadoEm: null,
  concluidoEm: "2026-09-23T13:00:00.000Z", somenteLeitura: true, aguardandoVez: false,
  revisaoPedida: false, link: null, pdf: "/api/cliente/relatorio/rel1/pdf",
};
const DADOS = {
  nome: "Renato Massano", email: "massano.renato@gmail.com", faturamento: false,
  obras: [{ opNumero: "105", obra: "Bianchini", cliente: "TMSA", documentos: [CONSULTA], pendentes: 0 }],
};

beforeEach(() => { globalThis.React = React; globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => DADOS }); });
afterEach(cleanup);

describe("o espaço do cliente", () => {
  it("mostra o relatório fechado como leitura, com PDF e sem convite para assinar", async () => {
    render(<MeuEspacoClient />);
    // ⚠ a primeira obra já abre sozinha (`setAberta` no carregamento) — clicar aqui FECHARIA
    await waitFor(() => expect(screen.getAllByText(/Bianchini/).length).toBeGreaterThan(0));

    expect(screen.getByText(/para consulta/i)).toBeTruthy();
    expect(screen.getByText(/assinado por todos em/i)).toBeTruthy();
    expect(screen.getByText(/abrir o PDF/i).getAttribute("href")).toBe("/api/cliente/relatorio/rel1/pdf");
    expect(screen.queryByText(/abrir para assinar/i)).toBe(null);
    // ⚠ nem a tarja da obra nem o contador do topo: consulta não espera ninguém
    expect(screen.queryByText(/a assinar/i)).toBe(null);
    expect(screen.queryByText(/espera a sua assinatura/i)).toBe(null);
  });
});
