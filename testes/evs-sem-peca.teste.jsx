// @vitest-environment jsdom
// Verificação das travas (02/10/2026): o EVS pode nascer sem peça no computador — e então a "Nova junta" vinha
// com a peça em branco e o seletor só oferecia "—". A trava cobra "Peça em branco", e a única saída (incluir a
// peça em "Peças do relatório", salvar e só então escolher) não estava escrita em lugar nenhum.
import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import FormEVS from "@/app/qualidade/inspecoes/[id]/FormEVS";

beforeEach(() => {
  globalThis.React = React;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ soldadores: [], eps: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Tela({ marcas }) {
  const [linhas, setLinhas] = useState([{ marca: "", qtd: 1 }]);
  return (
    <>
      <FormEVS rel={{ marcas }} linhas={linhas} res={{}} travado={false} setLinhas={setLinhas} setResultado={() => {}} />
      <pre data-testid="linhas">{JSON.stringify(linhas)}</pre>
    </>
  );
}

it("relatório sem peças: a peça da junta se digita, e a tela diz onde incluir as peças do relatório", () => {
  render(<Tela marcas={[]} />);
  fireEvent.change(screen.getByLabelText("Peça da junta 1"), { target: { value: "t89a1" } });
  expect(JSON.parse(screen.getByTestId("linhas").textContent)[0].marca).toBe("T89A1");
  expect(screen.getByText(/não tem peças/i)).toBeTruthy();
});

it("com peças no relatório, continua o seletor com elas", () => {
  render(<Tela marcas={["T89A1", "T89A2"]} />);
  const sel = screen.getByLabelText("Peça da junta 1");
  expect(sel.tagName).toBe("SELECT");
  expect([...sel.querySelectorAll("option")].map((o) => o.value)).toEqual(["", "T89A1", "T89A2"]);
});
