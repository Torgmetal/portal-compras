// @vitest-environment jsdom
// REC é "recomendação de exame complementar" — termo dos ensaios de solda. No recebimento de tintas e nos
// ensaios da superfície (sais, poeira, pull-off) o modelo só tem aprovado/reprovado, e a trava cobra um dos
// dois: o botão REC ali só servia para segurar o relatório (verificação dos modelos, 02/10/2026).
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/qualidade/inspecoes/r1" }));
vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));

import Medir from "@/app/campo/Medir";
import RelatorioDetalheClient from "@/app/qualidade/inspecoes/[id]/RelatorioDetalheClient";

let relatorio;
beforeEach(() => {
  globalThis.React = React;
  vi.stubGlobal("alert", vi.fn());
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const r = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
    const u = String(url);
    if (u.startsWith("/api/campo/relatorios/")) return r({ relatorio, quantidadesLista: {} });
    if (u === "/api/qualidade/inspecoes/r1") return r({ relatorio, assinaturas: [], quantidadesLista: {} });
    if (u.startsWith("/api/qualidade/plp/")) return r({ tintas: [], plp: null });
    if (u.startsWith("/api/qualidade/soldagem")) return r({ soldadores: [], eps: [] });
    if (u.startsWith("/api/campo/foto")) return r({ fotos: [] });
    return r({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const rel = (tipo, codigo) => ({ id: "r1", codigo, tipo, tipoLabel: tipo, rotuloRevisao: "R00", opNumero: "112", revisao: 0, marcas: ["T112A1"], equipamentos: [], linhas: [], resultados: {} });
const Tela = ({ titulo, children }) => <div><h1>{titulo}</h1>{children}</div>;
const celular = () => render(<Medir op={{ numero: "112", id: "op" }} onSair={() => {}} Tela={Tela} Equipamentos={() => null} relatorioInicialId="r1" />);

it.each([["RECEBIMENTO_TINTA", "RRT-112-001"], ["PULL_OFF", "RPO-112-001"], ["SAIS", "RCS-112-001"], ["POEIRA", "RTP-112-001"]])("celular: %s só oferece aprovado e reprovado", async (tipo, codigo) => {
  relatorio = rel(tipo, codigo);
  celular();
  await screen.findByText(codigo);
  expect(screen.queryByText("Exame complementar")).toBeNull();
  expect(screen.getAllByText("Reprovado").length).toBeGreaterThan(0);
});

it("celular: o ultrassom continua com o REC", async () => {
  relatorio = rel("ULTRASSOM", "RUS-112-001");
  celular();
  await screen.findByText("RUS-112-001");
  expect(screen.getByText("Exame complementar")).toBeTruthy();
});

it("computador: o recebimento só oferece aprovado e reprovado; o LP continua com o REC", async () => {
  relatorio = rel("RECEBIMENTO_TINTA", "RRT-112-001");
  render(<RelatorioDetalheClient id="r1" />);
  await screen.findAllByText(/RRT-112-001/);
  expect(screen.queryByText("exame compl.")).toBeNull();
  cleanup();
  relatorio = rel("LP", "RLP-112-001");
  render(<RelatorioDetalheClient id="r1" />);
  await screen.findAllByText(/RLP-112-001/);
  expect(screen.getByText("exame compl.")).toBeTruthy();
});
