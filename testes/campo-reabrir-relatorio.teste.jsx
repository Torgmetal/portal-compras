// @vitest-environment jsdom
// "ESTÁ SUMINDO ALGUMAS INFORMAÇÕES QUE ELA COLOCOU" (Vitor, 23/09/2026, sobre a Lais no portal de
// campo). Dois caminhos da tela do celular perdiam o que o inspetor tinha feito:
//
// 1. Reabrir o relatório de ultrassom mostrava EM BRANCO processo de soldagem, metal de adição,
//    tipo de junta, chanfro e o cabeçote — gravados, mas a tela não os lia de volta.
// 2. A lixeira de uma junta desalinhava as outras: a tela recontava as posições e o servidor, que
//    mescla pela posição, escrevia os dados da 2ª junta por cima da 1ª.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));

import Medir from "@/app/campo/Medir";

let relatorio;
let enviado;

beforeEach(() => {
  globalThis.React = React; // os .jsx do app usam o runtime clássico no vitest
  enviado = null;
  vi.stubGlobal("alert", vi.fn());
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const resposta = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
    if (String(url).startsWith("/api/campo/relatorios/") && opts.method === "PATCH") {
      enviado = JSON.parse(opts.body);
      return resposta({ ok: true });
    }
    if (String(url).startsWith("/api/campo/relatorios/")) return resposta({ relatorio, quantidadesLista: {} });
    if (String(url).startsWith("/api/campo/foto")) return resposta({ fotos: [] });
    if (String(url).startsWith("/api/qualidade/soldagem")) return resposta({ soldadores: [], eps: [] });
    if (String(url).startsWith("/api/qualidade/plp/")) return resposta({ tintas: [], plp: null });
    return resposta({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const Tela = ({ titulo, children }) => <div><h1>{titulo}</h1>{children}</div>;
const abrir = () => render(
  <Medir op={{ numero: "113", id: "op" }} onSair={() => {}} Tela={Tela} Equipamentos={() => null} relatorioInicialId="r1" />,
);

it("reabrir o ultrassom traz de volta processo, metal de adição, junta, chanfro e o cabeçote", async () => {
  relatorio = {
    id: "r1", codigo: "RUS-113-001", tipo: "ULTRASSOM", tipoLabel: "Ultrassom", rotuloRevisao: "R00",
    opNumero: "113", marcas: ["T113A1"], linhas: [], equipamentos: [],
    resultados: {
      processoSolda: "FCAW", metalAdicao: "E71T-1", tipoJunta: "Topo", chanfro: "X",
      cbFabricante: "Doppler", cbModelo: "angular 20x22 · 45 · 2 MHz",
    },
  };
  abrir();
  await screen.findByText("RUS-113-001");

  expect(screen.getByLabelText("Processo de soldagem").value).toBe("FCAW");
  expect(screen.getByLabelText(/Metal de adição/).value).toBe("E71T-1");
  expect(screen.getByLabelText(/Tipo de junta/).value).toBe("Topo");
  expect(screen.getByLabelText("Tipo de chanfro").value).toBe("X");
  // o seletor só reconhece a opção com a MARCA junto — sem ela, abria em "Selecione…"
  expect(screen.getByLabelText(/Modelo, ângulo e frequência/).value).toBe("Doppler|angular 20x22 · 45 · 2 MHz");
});

it("apagar a primeira junta não escreve os dados da segunda por cima dela", async () => {
  relatorio = {
    id: "r1", codigo: "EVS-102-009", tipo: "VISUAL_SOLDA", tipoLabel: "Visual de solda", rotuloRevisao: "R00",
    opNumero: "102", marcas: ["T1", "T2", "T3"], equipamentos: [],
    resultados: { qtdPeca: { T1: 1, T2: 1, T3: 1 } },
    linhas: [
      { marca: "T1", qtd: 1, laudo: "A", soldador: "Ana" },
      { marca: "T2", qtd: 1, laudo: "R", soldador: "Bia", descontinuidade: "TR" },
      { marca: "T3", qtd: 1, laudo: "A", soldador: "Caio" },
    ],
  };
  const { container } = abrir();
  await screen.findByText("EVS-102-009");

  // a lixeira da primeira junta (o botão ao lado do nome da peça)
  const cartaoT1 = [...container.querySelectorAll("span.font-bold")].find((s) => s.textContent === "T1").closest("div");
  fireEvent.click(cartaoT1.querySelector("button"));
  fireEvent.click(screen.getByRole("button", { name: /Gravar medidas/ }));
  await waitFor(() => expect(enviado).not.toBeNull());

  // cada junta segue com a SUA posição de origem — a T2 continua sendo a 1, a T3 a 2
  expect(enviado.medidas.map((m) => [m.i, m.marca, m.laudo])).toEqual([[1, "T2", "R"], [2, "T3", "A"]]);
  // e a apagada vai dita à parte, com a marca para o servidor conferir
  expect(enviado.removidas).toEqual([{ i: 0, marca: "T1" }]);
});

it("junta acrescentada no celular entra DEPOIS das gravadas, sem pular posição", async () => {
  relatorio = {
    id: "r1", codigo: "EVS-102-010", tipo: "VISUAL_SOLDA", tipoLabel: "Visual de solda", rotuloRevisao: "R00",
    opNumero: "102", marcas: ["T1", "T2"], equipamentos: [],
    resultados: { qtdPeca: { T1: 1, T2: 1 } },
    linhas: [{ marca: "T1", qtd: 1, laudo: "A" }, { marca: "T2", qtd: 1, laudo: "A" }],
  };
  const { container } = abrir();
  await screen.findByText("EVS-102-010");

  vi.stubGlobal("prompt", vi.fn(() => "t9"));
  fireEvent.click(screen.getByRole("button", { name: /Digitar/ }));
  // apaga a T1: a nova não pode herdar a posição que ficou livre
  const cartaoT1 = [...container.querySelectorAll("span.font-bold")].find((s) => s.textContent === "T1").closest("div");
  fireEvent.click(cartaoT1.querySelector("button"));
  fireEvent.click(screen.getByRole("button", { name: /Gravar medidas/ }));
  await waitFor(() => expect(enviado).not.toBeNull());

  expect(enviado.medidas.map((m) => [m.i, m.marca])).toEqual([[1, "T2"], [2, "T9"]]);
  expect(enviado.removidas).toEqual([{ i: 0, marca: "T1" }]);
});

it("pintura não diz que 'quem monta lança as juntas no computador' — pintura não tem junta", async () => {
  relatorio = {
    id: "r1", codigo: "RIP-102-001", tipo: "PINTURA", tipoLabel: "Pintura", rotuloRevisao: "R00",
    opNumero: "102", marcas: [], linhas: [], equipamentos: [], resultados: {},
  };
  abrir();
  await screen.findByText("RIP-102-001");
  expect(screen.queryByText(/Quem monta faz isso no computador/)).toBeNull();
});

it("visual de solda sem junta aponta para o Ler QR / Digitar — a junta nasce no campo", async () => {
  relatorio = {
    id: "r1", codigo: "EVS-102-011", tipo: "VISUAL_SOLDA", tipoLabel: "Visual de solda", rotuloRevisao: "R00",
    opNumero: "102", marcas: [], linhas: [], equipamentos: [], resultados: {},
  };
  abrir();
  await screen.findByText("EVS-102-011");
  expect(screen.queryByText(/Quem monta faz isso no computador/)).toBeNull();
  expect(screen.getByText(/Ler QR ou Digitar/)).toBeTruthy();
});

it("relatório já enviado para assinatura abre para completar, avisando que fica registrado", async () => {
  relatorio = {
    id: "r1", codigo: "RLP-102-001", tipo: "LP", tipoLabel: "Líquido penetrante", rotuloRevisao: "R00",
    opNumero: "102", marcas: ["T102B45"], equipamentos: [], resultados: {}, envioAssinaturaId: "env-1",
    linhas: [{ marca: "T102B45", laudo: "A", indicacaoLp: "", local: "", tamanho: "", tipoDefeito: "" }],
  };
  abrir();
  await screen.findByText("RLP-102-001");
  expect(screen.getByText(/enviado para assinatura/i)).toBeTruthy();
  expect(screen.getByText(/fica registrad/i)).toBeTruthy();
});
