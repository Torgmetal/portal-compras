// @vitest-environment jsdom
// Verificação das travas (02/10/2026): o celular oferecia "Inspeção de pré-montagem", mas a pré-montagem nasce
// do PROJETO (o diagrama de montagem escolhido na pasta da obra) e o celular não tem onde escolhê-lo — a
// criação voltava sempre 400 "Escolha ao menos um projeto". Agora ela nasce no computador, e o celular só mede.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NovoRelatorio from "@/app/campo/NovoRelatorio";

beforeEach(() => { globalThis.React = React; vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ pecas: [], fases: [] }) }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const Tela = ({ titulo, children }) => <div><h1>{titulo}</h1>{children}</div>;

it("o celular não oferece criar pré-montagem — e diz onde ela nasce", () => {
  render(<NovoRelatorio op={{ id: "op", numero: "112" }} onCriado={vi.fn()} onSair={vi.fn()} Tela={Tela} />);
  expect(screen.queryByText("Inspeção de pré-montagem")).toBeNull();
  expect(screen.getByText(/pré-montagem nasce do projeto/i)).toBeTruthy();
  expect(screen.getByText("Inspeção dimensional e visual")).toBeTruthy();
});

it("obra sem pré-montagem no escopo: nem o aviso aparece", () => {
  render(<NovoRelatorio op={{ id: "op", numero: "112", tipos: ["DIMENSIONAL", "PINTURA"] }} onCriado={vi.fn()} onSair={vi.fn()} Tela={Tela} />);
  expect(screen.queryByText(/pré-montagem nasce do projeto/i)).toBeNull();
});
