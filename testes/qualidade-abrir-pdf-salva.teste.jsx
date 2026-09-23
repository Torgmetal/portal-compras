// @vitest-environment jsdom
// Vitor (23/09/2026): "as informações adicionadas não estão indo para o pdf". Na tela do computador,
// preencher a junta soldada e clicar em "Abrir PDF" abria o documento GRAVADO — sem o que acabara de
// ser preenchido. O banco confirmou: nenhuma gravação depois das 19h12. Agora o botão grava antes.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { completarEps } from "@/lib/eps-casa";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/qualidade/inspecoes/r1" }));
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));

import RelatorioDetalheClient from "@/app/qualidade/inspecoes/[id]/RelatorioDetalheClient";

const EPS = ["01", "02", "03", "04", "05"].map((n) => completarEps({ codigo: `EPS-RQPS ${n}` }));
const RELATORIO = {
  id: "r1", codigo: "RLP-102-001", tipo: "LP", opNumero: "102", revisao: 0, marcas: ["T102B45"],
  envioAssinaturaId: "env-1", equipamentos: [{ id: "LX-01", nome: "LX-01 — LUXÍMETRO", codigo: "LX-01" }],
  linhas: [{ marca: "T102B45", laudo: "A", indicacaoLp: "", local: "", tamanho: "", tipoDefeito: "" }],
  resultados: { tipoPenetrante: "II", metodo: "A" },
};
let enviado;
let aba;

beforeEach(() => {
  globalThis.React = React;
  enviado = null;
  aba = { location: { href: "" }, close: vi.fn(), opener: {} };
  vi.stubGlobal("open", vi.fn(() => aba));
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const r = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
    const u = String(url);
    if (u === "/api/qualidade/inspecoes/r1" && opts.method === "PATCH") {
      enviado = JSON.parse(opts.body);
      return r({ ok: true, relatorio: { ...RELATORIO, resultados: enviado.resultados } });
    }
    if (u === "/api/qualidade/inspecoes/r1") return r({ relatorio: RELATORIO, assinaturas: [{ nome: "Geraldo Tank", assinadoEm: "2026-09-21" }], quantidadesLista: {} });
    if (u.startsWith("/api/qualidade/soldagem")) return r({ soldadores: [], eps: EPS });
    return r({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("escolher a EPS e clicar em Abrir PDF grava antes — o PDF sai com a junta soldada", async () => {
  render(<RelatorioDetalheClient id="r1" />);
  const sel = await screen.findByLabelText("Acrescentar EPS");
  await waitFor(() => expect(sel.querySelectorAll("option").length).toBe(6));
  fireEvent.change(sel, { target: { value: "EPS 002/2025" } });

  fireEvent.click(screen.getByText("Abrir PDF"));
  await waitFor(() => expect(aba.location.href).toContain("/api/qualidade/inspecoes/r1/pdf"));
  expect(enviado.resultados).toMatchObject({ eps: "EPS 002/2025", rqs: "RQPS 002/2025", processoSolda: "FCAW", metalAdicao: "E71T-1C" });
});
