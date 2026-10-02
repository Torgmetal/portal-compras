// @vitest-environment jsdom
// Verificação dos modelos (02/10/2026) no celular:
//  · dimensional: as três verificações do modelo (dimensional, alinhamento, acabamento) não existiam, e o
//    relatório medido no campo ia para assinatura com as três caixas vazias;
//  · ultrassom: a indicação lançada no campo não tinha laudo nem soldador/sinete, e saía em branco no PDF.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/store", () => ({ useStore: () => ({ showToast: vi.fn() }) }));

import Medir from "@/app/campo/Medir";

let relatorio, enviado;
beforeEach(() => {
  globalThis.React = React;
  enviado = null;
  vi.stubGlobal("alert", vi.fn());
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const resposta = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
    if (String(url).startsWith("/api/campo/relatorios/") && opts.method === "PATCH") { enviado = JSON.parse(opts.body); return resposta({ ok: true }); }
    if (String(url).startsWith("/api/campo/relatorios/")) return resposta({ relatorio, quantidadesLista: {} });
    if (String(url).startsWith("/api/campo/foto")) return resposta({ fotos: [] });
    if (String(url).startsWith("/api/qualidade/soldagem")) return resposta({ soldadores: [{ id: "s1", nome: "EBERTON ALVES", sinete: "S-02", qualificado: true }], eps: [] });
    if (String(url).startsWith("/api/qualidade/plp/")) return resposta({ tintas: [], plp: null });
    return resposta({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const Tela = ({ titulo, children }) => <div><h1>{titulo}</h1>{children}</div>;
const abrir = () => render(<Medir op={{ numero: "084", id: "op" }} onSair={() => {}} Tela={Tela} Equipamentos={() => null} relatorioInicialId="r1" />);
const gravar = async () => { fireEvent.click(screen.getByRole("button", { name: /Gravar medidas/ })); await waitFor(() => expect(enviado).not.toBeNull()); };

it("dimensional: marca dimensional, alinhamento e acabamento no celular, e eles vão para a rota", async () => {
  relatorio = { id: "r1", codigo: "RID-084-001", tipo: "DIMENSIONAL", tipoLabel: "Dimensional", rotuloRevisao: "R00", opNumero: "084",
    marcas: ["T84A1"], equipamentos: [], linhas: [{ marca: "T84A1", letra: "A", descricao: "Cota A", projetoMm: 100 }],
    resultados: { alinhamento: "APROVADO" } };
  abrir();
  await screen.findByText("RID-084-001");
  fireEvent.click(screen.getByLabelText("Dimensional: Aprovado"));
  fireEvent.click(screen.getByLabelText("Acabamento: Reprovado"));
  await gravar();
  expect(enviado.condicoes).toEqual({ dimensional: "APROVADO", alinhamento: "APROVADO", acabamento: "REPROVADO" });
});

it("ultrassom: a indicação ganha laudo e soldador (com o sinete) no celular", async () => {
  relatorio = { id: "r1", codigo: "RUS-084-001", tipo: "ULTRASSOM", tipoLabel: "Ultrassom", rotuloRevisao: "R00", opNumero: "084",
    marcas: ["T84A1"], equipamentos: [], linhas: [{ marca: "T84A1", indicacao: "1" }], resultados: {} };
  abrir();
  await screen.findByText("RUS-084-001");
  await waitFor(() => expect(screen.getByLabelText("Soldador da indicação").querySelectorAll("option").length).toBe(2));
  fireEvent.change(screen.getByLabelText("Soldador da indicação"), { target: { value: "EBERTON ALVES" } });
  fireEvent.click(screen.getByLabelText("Laudo da indicação: Reprovado"));
  await gravar();
  expect(enviado.medidas[0]).toMatchObject({ laudo: "R", soldador: "EBERTON ALVES", sinete: "S-02" });
});
