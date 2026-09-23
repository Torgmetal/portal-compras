// @vitest-environment jsdom
// Vitor (23/09/2026): "as informações adicionadas não estão indo para o pdf". No celular, a prévia é o
// PDF GRAVADO: preencher e tocar em "Ver prévia" mostrava o relatório sem o que acabara de ser posto.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { completarEps } from "@/lib/eps-casa";

vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));
import Medir from "@/app/campo/Medir";

const EPS = ["01", "02", "03", "04", "05"].map((n) => completarEps({ codigo: `EPS-RQPS ${n}` }));
let relatorio;
let patches;
let leituras;
let aba;

beforeEach(() => {
  globalThis.React = React;
  patches = [];
  leituras = 0;
  aba = { location: { href: "" }, close: vi.fn(), opener: {} };
  vi.stubGlobal("alert", vi.fn());
  vi.stubGlobal("open", vi.fn(() => aba));
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const r = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
    const u = String(url);
    if (u === "/api/campo/relatorios/r1" && opts.method === "PATCH") {
      const corpo = JSON.parse(opts.body);
      patches.push(corpo);
      // o servidor grava: a leitura seguinte já traz a junta soldada
      relatorio = { ...relatorio, resultados: { ...relatorio.resultados, ...corpo.condicoes } };
      return r({ ok: true });
    }
    if (u === "/api/campo/relatorios/r1") { leituras++; return r({ relatorio, quantidadesLista: {} }); }
    if (u.startsWith("/api/qualidade/soldagem")) return r({ soldadores: [], eps: EPS });
    return r({ fotos: [] });
  }));
  relatorio = {
    id: "r1", codigo: "RLP-102-001", tipo: "LP", tipoLabel: "Líquido penetrante", rotuloRevisao: "R00",
    opNumero: "102", marcas: ["T102B45"], equipamentos: [], resultados: {}, envioAssinaturaId: "env-1",
    linhas: [{ marca: "T102B45", laudo: "A", indicacaoLp: "", local: "", tamanho: "", tipoDefeito: "" }],
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const onVoltar = vi.fn();
const Tela = ({ titulo, voltar, children }) => <div><h1>{titulo}</h1><button onClick={voltar}>voltar</button>{children}</div>;
const abrir = () => render(<Medir op={{ numero: "102", id: "op" }} onSair={onVoltar} Tela={Tela} Equipamentos={() => null} relatorioInicialId="r1" />);

it("com alteração, 'Gravar e ver a prévia' grava, abre o PDF e continua na tela", async () => {
  abrir();
  await screen.findByText("RLP-102-001");
  const sel = await screen.findByLabelText("Acrescentar EPS");
  await waitFor(() => expect(sel.querySelectorAll("option").length).toBeGreaterThan(1));
  fireEvent.change(sel, { target: { value: "EPS 002/2025" } });

  fireEvent.click(screen.getByRole("button", { name: /Gravar e ver a prévia/ }));
  await waitFor(() => expect(aba.location.href).toBe("/api/qualidade/inspecoes/r1/pdf"));
  expect(patches).toHaveLength(1);
  expect(patches[0].condicoes).toMatchObject({ eps: "EPS 002/2025", processoSolda: "FCAW" });
  // continua no relatório, relido do servidor — e já sem nada pendente
  await waitFor(() => expect(leituras).toBe(2));
  expect(screen.getByText("RLP-102-001")).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("button", { name: /Ver prévia do relatório/ })).toBeTruthy());
});

it("sem alteração, abre a prévia direto — nada é gravado", async () => {
  abrir();
  await screen.findByText("RLP-102-001");
  fireEvent.click(await screen.findByRole("button", { name: /Ver prévia do relatório/ }));
  expect(window.open).toHaveBeenCalledWith("/api/qualidade/inspecoes/r1/pdf", "_blank", "noopener");
  expect(patches).toHaveLength(0);
});
