// @vitest-environment jsdom
// AS DUAS TELAS DA PINTURA DEPOIS DA VERIFICAÇÃO (02/10/2026).
//
// O computador (FormPintura) e o celular (app/campo/Pintura) calculam a média com a MESMA função do PDF —
// e ela contava a leitura em branco como zero. O select "Laudo final" do computador gravava um campo que o
// PDF preferia ao resultado da inspeção. "Descrição" e a OBS. da folha de fotos não tinham onde ser
// preenchidas. E no celular a 1ª demão acendia vermelho contra a micragem do sistema inteiro, que só a
// película final alcança.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FormPintura from "@/app/qualidade/inspecoes/[id]/FormPintura";
import Pintura from "@/app/campo/Pintura";

beforeEach(() => {
  globalThis.React = React;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

let resPc;
function TelaPc({ rel = { opNumero: "103" }, inicial = {} }) {
  const [res, setRes] = React.useState(inicial);
  resPc = res;
  return <FormPintura rel={{ ...rel, resultados: res }} res={res} travado={false} setResultado={(k, v) => setRes((r) => ({ ...r, [k]: v }))} />;
}

let cond;
function TelaCampo({ inicial = { demaos: {} } }) {
  const [c, setC] = React.useState(inicial);
  cond = c;
  return <Pintura cond={c} setCond={setC} />;
}

describe("computador (FormPintura)", () => {
  it("achado 1 — a média ignora a leitura em branco e sai com vírgula", async () => {
    render(<TelaPc inicial={{ rugLeituras: ["62", "71", "", "", ""], espessuras: { 1: ["262", "275", "281", "", ""] } }} />);
    expect(await screen.findByText(/média 66,5 µm/)).toBeTruthy();
    expect(screen.getByText("272,7")).toBeTruthy();
  });

  it("achado 2 — não existe mais o select 'Laudo final': o laudo é o Resultado da inspeção", async () => {
    render(<TelaPc rel={{ opNumero: "103", resultadoInspecao: "REPROVADO" }} inicial={{ laudo: "Aprovado" }} />);
    await screen.findByText(/Medições de espessura/);
    expect(screen.queryByRole("combobox", { name: /laudo/i })).toBeNull();
    // e a tela mostra o que vai sair no PDF — o resultado, não o laudo antigo
    expect(screen.getByText(/Laudo final/).closest("div").textContent).toMatch(/Reprovado/);
  });

  it("achado 4 — WJ1, WJ2 e WJ3 do modelo se escolhem no grau de limpeza", async () => {
    render(<TelaPc />);
    const grau = await screen.findByRole("combobox", { name: "Grau de limpeza" });
    const valores = [...grau.options].map((o) => o.value);
    expect(valores).toEqual(expect.arrayContaining(["WJ1", "WJ2", "WJ3", "ST3", "SA2"]));
  });

  it("achado 11 — Descrição e a OBS. da folha de fotos têm campo", async () => {
    render(<TelaPc />);
    fireEvent.change(await screen.findByLabelText("Descrição"), { target: { value: "Pipe-rack PR-03" } });
    expect(resPc.descricao).toBe("Pipe-rack PR-03");
    fireEvent.change(screen.getByLabelText(/OBS\. do registro fotográfico/i), { target: { value: "Fotos no galpão 2" } });
    expect(resPc.obsFotos).toBe("Fotos no galpão 2");
  });
});

describe("celular (campo)", () => {
  const leitura = (i) => screen.getByLabelText(`Leitura ${i} de espessura`);
  const TRES_DEMAOS = { 1: { produto: "FUNDO" }, 2: { produto: "INTERMEDIARIA" }, 3: { produto: "ACABAMENTO" } };

  it("achado 10 — a leitura acumulada da 1ª demão não acende vermelho contra o mínimo do SISTEMA", () => {
    render(<TelaCampo inicial={{ espessuraMinima: "240", demaos: TRES_DEMAOS, espessuras: { 1: ["92", "88", "101", "95", "90"], 3: ["262", "230", "281", "", ""] } }} />);
    for (let i = 1; i <= 5; i++) expect(leitura(i).getAttribute("aria-invalid")).not.toBe("true");
    expect(screen.getByText(/conferido na 3ª demão/i)).toBeTruthy();
    // a demão que fecha a película é julgada, leitura a leitura (PO-05, 5.5.3.1)
    fireEvent.click(screen.getByRole("button", { name: "3ª demão" }));
    expect(leitura(2).getAttribute("aria-invalid")).toBe("true");
    expect(leitura(1).getAttribute("aria-invalid")).not.toBe("true");
    expect(screen.getByText(/mínimo 240/)).toBeTruthy();
  });

  it("achado 10 — relatório só de fundo: a 1ª demão é a final e continua julgada", () => {
    render(<TelaCampo inicial={{ espessuraMinima: "80", demaos: { 1: { produto: "FUNDO" } }, espessuras: { 1: ["70", "95"] } }} />);
    expect(leitura(1).getAttribute("aria-invalid")).toBe("true");
    expect(leitura(2).getAttribute("aria-invalid")).not.toBe("true");
  });

  it("achado 1 — a média do celular ignora a leitura em branco", () => {
    render(<TelaCampo inicial={{ demaos: {}, rugLeituras: ["62", "71", "", "", ""], espessuras: { 1: ["262", "275", "281", "", ""] } }} />);
    expect(screen.getByText(/média 66,5 µm/)).toBeTruthy();
    expect(screen.getByText(/média 272,7 µm/)).toBeTruthy();
  });

  it("achado 4 — WJ1, WJ2 e WJ3 também no celular", () => {
    render(<TelaCampo />);
    const valores = [...screen.getByLabelText("Grau de limpeza obtido").options].map((o) => o.value);
    expect(valores).toEqual(expect.arrayContaining(["WJ1", "WJ2", "WJ3"]));
  });

  it("achado 11 — Descrição e a OBS. da folha de fotos também no celular", () => {
    render(<TelaCampo />);
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Pipe-rack PR-03" } });
    expect(cond.descricao).toBe("Pipe-rack PR-03");
    fireEvent.change(screen.getByLabelText(/OBS\. do registro fotográfico/i), { target: { value: "Fotos no galpão 2" } });
    expect(cond.obsFotos).toBe("Fotos no galpão 2");
  });
});
