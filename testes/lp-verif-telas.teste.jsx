// @vitest-environment jsdom
// As telas do LÍQUIDO PENETRANTE (verificação dos modelos, 02/10/2026).
//
// ⚠⚠ O LAUDO NÃO SE ESCOLHIA NO COMPUTADOR desde que o formulário nasceu (5985bb48, 22/08/2026): a lista
// de laudos (lib/evs-campos) tem `c`, e a tela lia `x.id` — saíam três opções em branco, e escolher
// qualquer uma APAGAVA o laudo vindo do celular. O DESENHO TORG, que o PDF imprime e as duas rotas
// gravam, não tinha onde ser preenchido; e a observação de cada linha, que o celular pede e o PDF agora
// imprime, não aparecia no computador.
import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import FormLP from "@/app/qualidade/inspecoes/[id]/FormLP";
import { ParametrosLP } from "@/app/campo/Lp";

beforeEach(() => {
  globalThis.React = React;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ eps: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Tela({ linhasIniciais, resInicial = {} }) {
  const [linhas, setLinhas] = useState(linhasIniciais);
  const [res, setRes] = useState(resInicial);
  return (
    <>
      <FormLP rel={{ marcas: ["T89A1", "T89A2"] }} linhas={linhas} res={res} travado={false} setLinhas={setLinhas}
        setResultado={(k, v) => setRes((r) => ({ ...r, [k]: v }))} />
      <pre data-testid="linhas">{JSON.stringify(linhas)}</pre>
      <pre data-testid="res">{JSON.stringify(res)}</pre>
    </>
  );
}
const linhasGravadas = () => JSON.parse(screen.getByTestId("linhas").textContent);
const resGravado = () => JSON.parse(screen.getByTestId("res").textContent);
const linhaR = { marca: "T89A1", indicacaoLp: "1", local: "Topo", tamanho: "3", tipoDefeito: "IL", laudo: "R" };

it("o laudo vindo do celular aparece escolhido, e as três opções têm valor e nome", () => {
  const erros = vi.spyOn(console, "error").mockImplementation(() => {});
  render(<Tela linhasIniciais={[linhaR]} />);
  const sel = screen.getByLabelText("Laudo da linha 1");
  expect(sel.value).toBe("R");
  const opcoes = within(sel).getAllByRole("option").map((o) => [o.value, o.textContent]);
  expect(opcoes).toEqual([["", "—"], ["A", "A"], ["R", "R"], ["REC", "REC"]]);
  // a chave das opções era `undefined` nas três — o React avisava a cada render
  expect(erros.mock.calls.flat().join(" ")).not.toMatch(/unique "key"/);
  erros.mockRestore();
});

it("escolher outro laudo grava o código, não apaga", () => {
  render(<Tela linhasIniciais={[linhaR]} />);
  fireEvent.change(screen.getByLabelText("Laudo da linha 1"), { target: { value: "REC" } });
  expect(linhasGravadas()[0]).toMatchObject({ marca: "T89A1", laudo: "REC" });
});

it("a observação de cada linha se lê e se corrige no computador", () => {
  render(<Tela linhasIniciais={[{ ...linhaR, obs: "reensaiada" }]} />);
  const campo = screen.getByLabelText("Observação da linha 1");
  expect(campo.value).toBe("reensaiada");
  fireEvent.change(campo, { target: { value: "reensaiada sem indicação" } });
  expect(linhasGravadas()[0].obs).toBe("reensaiada sem indicação");
});

it("o DESENHO TORG tem onde ser preenchido no computador — e, em branco, diz o que sai no lugar", () => {
  render(<Tela linhasIniciais={[]} />);
  // o rótulo do campo carrega a dica embaixo dele enquanto está em branco
  expect(screen.getByText("Em branco, o PDF sai com as peças do relatório")).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/^Desenho Torg/), { target: { value: "DES-T89-001" } });
  expect(resGravado()).toMatchObject({ desenho: "DES-T89-001" });
  expect(screen.queryByText("Em branco, o PDF sai com as peças do relatório")).toBeNull();
});

it("no celular, o DESENHO TORG entra nos parâmetros do LP", () => {
  function Campo() {
    const [cond, setCond] = useState({ desenho: "T89A1" });
    return (<><ParametrosLP cond={cond} setCond={setCond} /><pre data-testid="cond">{JSON.stringify(cond)}</pre></>);
  }
  render(<Campo />);
  const campo = screen.getByLabelText("Desenho Torg");
  expect(campo.value).toBe("T89A1");
  fireEvent.change(campo, { target: { value: "DES-T89-001" } });
  expect(JSON.parse(screen.getByTestId("cond").textContent)).toMatchObject({ desenho: "DES-T89-001" });
});
