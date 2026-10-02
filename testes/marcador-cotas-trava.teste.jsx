// @vitest-environment jsdom
// Verificação das travas (02/10/2026), no dimensional: a trava de assinatura cobra o VALOR DE PROJETO de cada
// cota ("Dimensão de projeto em branco"), mas
//  · o "outro valor (mm)" digitado com vírgula ("1250,5") virava NaN e ia em branco;
//  · o valor de projeto não era editável em lugar nenhum depois de criada a cota (só apagar e refazer);
//  · com o desenho sem abrir, a lista de cotas e o "+ cota sem marcação" sumiam junto.
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import MarcadorCotas from "@/app/qualidade/inspecoes/[id]/MarcadorCotas";

beforeEach(() => {
  globalThis.React = React;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: "Desenho não encontrado na pasta da obra" }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const cota = { letra: "A", descricao: "Cota A", projetoMm: null, tolerancia: "± 2", encontradoMm: null };
const abrir = (cotas, onChange = vi.fn()) => { render(<MarcadorCotas relatorioId="r1" marca="T1" cotas={cotas} onChange={onChange} comprimentoMm={1200} />); return onChange; };

it("desenho que não abre: o erro aparece, mas as cotas continuam editáveis e dá para criar cota sem marcação", async () => {
  abrir([cota]);
  await screen.findByText(/Desenho não encontrado/);
  expect(screen.getByLabelText("Valor de projeto da cota A (mm)")).toBeTruthy();
  expect(screen.getByRole("button", { name: /cota sem marcação no desenho/ })).toBeTruthy();
});

it("o valor de projeto se corrige na lista, com vírgula", async () => {
  const onChange = abrir([cota]);
  await screen.findByText(/Desenho não encontrado/);
  fireEvent.change(screen.getByLabelText("Valor de projeto da cota A (mm)"), { target: { value: "980,5" } });
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(onChange.mock.calls.at(-1)[0][0]).toMatchObject({ letra: "A", projetoMm: 980.5 });
});

it("'outro valor (mm)' com vírgula vira número — antes ia NaN e a cota nascia sem projeto", async () => {
  const onChange = abrir([]);
  await screen.findByText(/Desenho não encontrado/);
  fireEvent.click(screen.getByRole("button", { name: /cota sem marcação no desenho/ }));
  fireEvent.change(screen.getByPlaceholderText("outro valor (mm)"), { target: { value: "1250,5" } });
  fireEvent.click(screen.getByRole("button", { name: "usar este" }));
  expect(onChange.mock.calls.at(-1)[0][0]).toMatchObject({ letra: "A", projetoMm: 1250.5 });
});
