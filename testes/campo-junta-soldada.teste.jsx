// @vitest-environment jsdom
// Vitor (23/09/2026): "nos relatórios da OP-102 está faltando preencher Metal de adição, Processo de
// soldagem, EPS, RQS e tipo de junta". O modelo de LP/EVS imprimia os cinco, mas o celular — onde a
// inspetora trabalha — não tinha onde preenchê-los.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { completarEps } from "@/lib/eps-casa";

vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));

import Medir from "@/app/campo/Medir";

const EPS = ["01", "02", "03", "04", "05"].map((n) => completarEps({ codigo: `EPS-RQPS ${n}`, processo: null }));
let relatorio;
let enviado;

beforeEach(() => {
  globalThis.React = React;
  enviado = null;
  vi.stubGlobal("alert", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const resposta = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
    if (String(url).startsWith("/api/campo/relatorios/") && opts.method === "PATCH") {
      enviado = JSON.parse(opts.body);
      return resposta({ ok: true });
    }
    if (String(url).startsWith("/api/campo/relatorios/")) return resposta({ relatorio, quantidadesLista: {} });
    if (String(url).startsWith("/api/qualidade/soldagem")) return resposta({ soldadores: [], eps: EPS });
    return resposta({ fotos: [] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const Tela = ({ titulo, children }) => <div><h1>{titulo}</h1>{children}</div>;
const abrir = () => render(
  <Medir op={{ numero: "102", id: "op" }} onSair={() => {}} Tela={Tela} Equipamentos={() => null} relatorioInicialId="r1" />,
);
const lp = (resultados = {}) => ({
  id: "r1", codigo: "RLP-102-001", tipo: "LP", tipoLabel: "Líquido penetrante", rotuloRevisao: "R00",
  opNumero: "102", marcas: ["T102B45"], equipamentos: [], resultados,
  linhas: [{ marca: "T102B45", laudo: "A", indicacaoLp: "", local: "", tamanho: "", tipoDefeito: "" }],
});

const acrescentar = async (valor) => {
  const sel = await screen.findByLabelText("Acrescentar EPS");
  await waitFor(() => expect(sel.querySelectorAll("option").length).toBeGreaterThan(1));
  fireEvent.change(sel, { target: { value: valor } });
};

it("no LP, escolher a EPS preenche RQS, processo e metal de adição — e tudo vai na gravação", async () => {
  relatorio = lp();
  abrir();
  await screen.findByText("RLP-102-001");
  await acrescentar("EPS 002/2025");
  expect(screen.getByLabelText("Processo de soldagem").value).toBe("FCAW");
  expect(screen.getByLabelText("Metal de adição").value).toBe("E71T-1C");
  expect(screen.getByLabelText("RQS").value).toBe("RQPS 002/2025");
  fireEvent.change(screen.getByLabelText("Tipo de junta"), { target: { value: "Ângulo" } });

  fireEvent.click(screen.getByRole("button", { name: /Gravar medidas/ }));
  await waitFor(() => expect(enviado).not.toBeNull());
  expect(enviado.condicoes).toMatchObject({
    eps: "EPS 002/2025", rqs: "RQPS 002/2025", processoSolda: "FCAW", metalAdicao: "E71T-1C", tipoJunta: "Ângulo",
  });
});

it("duas EPS — GMAW e SMAW, como no EVS-102-001 — e tirar uma refaz os outros campos", async () => {
  relatorio = lp();
  abrir();
  await screen.findByText("RLP-102-001");
  await acrescentar("EPS 001/2025");
  await acrescentar("EPS 004/2025");
  expect(screen.getByLabelText("Processo de soldagem").value).toBe("GMAW, SMAW");
  expect(screen.getByLabelText("Metal de adição").value).toBe("ER70S-6, E7018");
  expect(screen.getByLabelText("RQS").value).toBe("RQPS 001/2025, RQPS 004/2025");
  fireEvent.click(screen.getByRole("button", { name: "Tirar EPS 001/2025" }));
  expect(screen.getByLabelText("Processo de soldagem").value).toBe("SMAW");
  expect(screen.getByLabelText("RQS").value).toBe("RQPS 004/2025");
});

it("reabrir traz a junta soldada de volta", async () => {
  relatorio = lp({ eps: "EPS 005/2025", rqs: "RQPS 005/2025", processoSolda: "FCAW", metalAdicao: "E71T-1C", tipoJunta: "Topo" });
  abrir();
  await screen.findByText("RLP-102-001");
  expect(screen.getByRole("button", { name: "Tirar EPS 005/2025" })).toBeTruthy();
  expect(screen.getByLabelText("RQS").value).toBe("RQPS 005/2025");
  expect(screen.getByLabelText("Tipo de junta").value).toBe("Topo");
});

it("valor digitado antes, fora da lista, continua à vista em vez de sumir", async () => {
  relatorio = lp({ eps: "EPS-01", tipoJunta: "Filete" });
  abrir();
  await screen.findByText("RLP-102-001");
  expect(screen.getByRole("button", { name: "Tirar EPS-01" })).toBeTruthy();
  expect(screen.getByLabelText("Tipo de junta").value).toBe("Filete");
});

it("o visual de solda também pede a junta soldada", async () => {
  relatorio = { ...lp(), codigo: "EVS-102-001", tipo: "VISUAL_SOLDA", tipoLabel: "Visual de solda", linhas: [], resultados: { qtdPeca: { T102B45: 1 } } };
  abrir();
  await screen.findByText("EVS-102-001");
  expect(screen.getByText("Junta soldada")).toBeTruthy();
});

it("pintura não tem junta soldada", async () => {
  relatorio = { ...lp(), codigo: "RIP-102-001", tipo: "PINTURA", tipoLabel: "Pintura", linhas: [], marcas: [] };
  abrir();
  await screen.findByText("RIP-102-001");
  expect(screen.queryByText("Junta soldada")).toBeNull();
});
