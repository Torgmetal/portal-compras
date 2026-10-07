// @vitest-environment jsdom
// O recebimento de tintas criado pelos certificados do CMR (07/10/2026) mostra quais foram escolhidos e em
// que posição (A, B, C) — a tela de antes só mostrava os lotes, e o certificado do diluente sumia de vista.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FormRecebimentoTinta from "@/app/qualidade/inspecoes/[id]/FormRecebimentoTinta";

beforeEach(() => { global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tintas: [] }) }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const certificados = [
  { docId: "d7", r: "260021", descricao: "DILUENTE PARA INDUSTHANE ACR 34.019", certificado: "3285", lote: "85598", nf: "17819" },
  { docId: "d5", r: "260019", descricao: "TINTA INDUSTHANE RHB 650", certificado: "3283", lote: "85596", nf: "17819" },
];

it("lista os certificados escolhidos com a posição de cada um", () => {
  render(<FormRecebimentoTinta rel={{ tipo: "RECEBIMENTO_TINTA", opNumero: "102" }} res={{ certificados, lotes: [] }} travado={false} setResultado={() => {}} />);
  expect(screen.getByText(/Certificados do CMR escolhidos/)).toBeTruthy();
  expect(screen.getByText("C · DILUENTE PARA INDUSTHANE ACR 34.019")).toBeTruthy();
  expect(screen.getByText("A · TINTA INDUSTHANE RHB 650")).toBeTruthy();
  expect(screen.getByText(/R 260021 · cert\. 3285 · lote 85598 · NF 17819/)).toBeTruthy();
});

it("relatório sem certificados escolhidos não mostra a caixa", () => {
  render(<FormRecebimentoTinta rel={{ tipo: "RECEBIMENTO_TINTA", opNumero: "102" }} res={{ lotes: [] }} travado={false} setResultado={() => {}} />);
  expect(screen.queryByText(/Certificados do CMR escolhidos/)).toBeNull();
});
