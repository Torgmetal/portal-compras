// @vitest-environment jsdom
// A observação de cada junta (verificação do EVS, 02/10/2026). O celular pede uma observação por junta e
// ela é gravada (`obs`), mas o formulário do COMPUTADOR não a mostrava: agora que ela sai no PDF, logo
// abaixo da junta, quem confere na mesa precisa ver e poder corrigir o texto que vai para o papel.
import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import FormEVS from "@/app/qualidade/inspecoes/[id]/FormEVS";

beforeEach(() => {
  globalThis.React = React;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ soldadores: [], eps: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Tela({ inicial, travado = false }) {
  const [linhas, setLinhas] = useState(inicial);
  return (
    <>
      <FormEVS rel={{ marcas: ["T89A1"] }} linhas={linhas} res={{}} travado={travado} setLinhas={setLinhas} setResultado={() => {}} />
      <pre data-testid="linhas">{JSON.stringify(linhas)}</pre>
    </>
  );
}
const gravadas = () => JSON.parse(screen.getByTestId("linhas").textContent);

it("a observação gravada no celular aparece em cada junta e pode ser corrigida", () => {
  render(<Tela inicial={[{ marca: "T89A1", qtd: 1, obs: "Trinca na raiz do filete" }, { marca: "T89A1", qtd: 1 }]} />);
  const campos = screen.getAllByLabelText("Observação da junta");
  expect(campos).toHaveLength(2);
  expect(campos[0].value).toBe("Trinca na raiz do filete");
  fireEvent.change(campos[1], { target: { value: "Respingo removido antes da inspeção" } });
  expect(gravadas()[1].obs).toBe("Respingo removido antes da inspeção");
  // o resto da junta continua como estava
  expect(gravadas()[0]).toMatchObject({ marca: "T89A1", qtd: 1, obs: "Trinca na raiz do filete" });
});

it("o campo aceita o mesmo tamanho que as rotas gravam (160) — além disso o texto seria cortado ao salvar", () => {
  render(<Tela inicial={[{ marca: "T89A1", qtd: 1 }]} />);
  expect(screen.getByLabelText("Observação da junta").maxLength).toBe(160);
});

it("relatório travado: a observação fica só para leitura", () => {
  render(<Tela travado inicial={[{ marca: "T89A1", qtd: 1, obs: "Falta de fusão no início do cordão" }]} />);
  const campo = screen.getByLabelText("Observação da junta");
  expect(campo.disabled).toBe(true);
  expect(campo.value).toBe("Falta de fusão no início do cordão");
});
