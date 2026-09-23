// @vitest-environment jsdom
// A junta soldada no formulário do COMPUTADOR (LP e EVS). Vitor (23/09/2026): "nos relatórios da OP-102
// está faltando preencher Metal de adição, Processo de soldagem, EPS, RQS e tipo de junta". Eram cinco
// textos livres; a EPS escolhida agora puxa processo, metal de adição e RQS.
import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { completarEps } from "@/lib/eps-casa";
import FormLP from "@/app/qualidade/inspecoes/[id]/FormLP";
import FormEVS from "@/app/qualidade/inspecoes/[id]/FormEVS";

const EPS = ["01", "02", "03", "04", "05"].map((n) => completarEps({ codigo: `EPS-RQPS ${n}`, processo: null }));

beforeEach(() => {
  globalThis.React = React;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ soldadores: [], eps: EPS }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Tela({ Form, inicial = {} }) {
  const [res, setRes] = useState(inicial);
  return (
    <>
      <Form rel={{ marcas: ["T102B45"] }} linhas={[]} res={res} travado={false} setLinhas={() => {}}
        setResultado={(k, v) => setRes((r) => ({ ...r, [k]: v }))} />
      <pre data-testid="res">{JSON.stringify(res)}</pre>
    </>
  );
}
const gravado = () => JSON.parse(screen.getByTestId("res").textContent);

const acrescentar = async (valor) => {
  const sel = screen.getByLabelText("Acrescentar EPS");
  await waitFor(() => expect(sel.querySelectorAll("option").length).toBe(6));
  fireEvent.change(sel, { target: { value: valor } });
};

for (const [nome, Form] of [["LP", FormLP], ["visual de solda", FormEVS]]) {
  it(`${nome}: escolher a EPS preenche RQS, processo e metal de adição`, async () => {
    render(<Tela Form={Form} />);
    await acrescentar("EPS 004/2025");
    fireEvent.change(screen.getByLabelText("Tipo de junta"), { target: { value: "Topo e ângulo" } });
    expect(gravado()).toMatchObject({
      eps: "EPS 004/2025", rqs: "RQPS 004/2025", processoSolda: "SMAW", metalAdicao: "E7018", tipoJunta: "Topo e ângulo",
    });
  });
}

it("duas EPS no mesmo relatório: cada campo lista as duas", async () => {
  render(<Tela Form={FormEVS} />);
  await acrescentar("EPS 001/2025");
  fireEvent.change(screen.getByLabelText("Acrescentar EPS"), { target: { value: "EPS 004/2025" } });
  expect(gravado()).toMatchObject({ eps: "EPS 001/2025, EPS 004/2025", processoSolda: "GMAW, SMAW", metalAdicao: "ER70S-6, E7018" });
});

it("processo e metal continuam editáveis depois de escolher a EPS", async () => {
  render(<Tela Form={FormLP} />);
  await acrescentar("EPS 001/2025");
  fireEvent.change(screen.getByLabelText("Metal de adição"), { target: { value: "ER70S-3" } });
  expect(gravado()).toMatchObject({ eps: "EPS 001/2025", metalAdicao: "ER70S-3" });
});

it("valor digitado à mão antes da lista continua à vista", async () => {
  render(<Tela Form={FormEVS} inicial={{ eps: "EPS-01", tipoJunta: "Filete" }} />);
  expect(screen.getByRole("button", { name: "Tirar EPS-01" })).toBeTruthy();
  expect(screen.getByLabelText("Tipo de junta").value).toBe("Filete");
});
