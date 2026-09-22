// @vitest-environment jsdom
// CONDIÇÃO AMBIENTAL POR ETAPA, NO CELULAR — e a micragem seca aberta.
//
// Vitor (22/09/2026): "precisas que tenha o campo para informarmos tanto no jato, quanto no fundo
// quanto nas demais demãos" e "deixe o campo de micragem seca aberto para ajustar (…) hoje um deles
// está dando como reprovado". A tela tinha UM bloco de temperatura/umidade (o do jato), que o PDF
// copiava nas três colunas, e a espessura mínima era só leitura, vinda do PLP da obra.
import React from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import Pintura from "@/app/campo/Pintura";

beforeEach(() => { globalThis.React = React; });
afterEach(cleanup);

let salvo;
function Tela({ inicial = { demaos: {} } }) {
  const [cond, setCond] = React.useState(inicial);
  salvo = cond;
  return <Pintura cond={cond} setCond={setCond} />;
}
const bloco = (nome) => within(screen.getByRole("group", { name: nome }));

it("o jateamento e cada demão têm a SUA temperatura e umidade", () => {
  render(<Tela />);
  const jato = bloco(/Condições ambientais · no jateamento/i);
  fireEvent.change(jato.getByLabelText("Umidade relativa (%)"), { target: { value: "41" } });
  fireEvent.change(jato.getByLabelText("Temp. ambiente (°C)"), { target: { value: "24" } });
  expect(salvo).toMatchObject({ prepUmidade: "41", prepTAmb: "24" });

  const fundo = bloco(/Condições ambientais · 1ª demão \(fundo\)/i);
  fireEvent.change(fundo.getByLabelText("Umidade relativa (%)"), { target: { value: "92" } });
  expect(salvo.demaos["1"]).toMatchObject({ umidade: "92" });
  // ⚠ o do jato não se mexe quando a demão recebe a leitura dela
  expect(salvo.prepUmidade).toBe("41");

  fireEvent.click(screen.getByRole("button", { name: "2ª demão" }));
  expect(bloco(/Condições ambientais · 2ª demão/i).getByLabelText("Umidade relativa (%)").value).toBe("");
});

it("demão sem leitura própria avisa que vai sair com a do jateamento", () => {
  render(<Tela inicial={{ prepUmidade: "41", prepTAmb: "24", demaos: { 1: { produto: "W-POXI" } } }} />);
  expect(screen.getByText(/vai sair com a do jateamento/i)).toBeTruthy();
  // ⚠ o campo mostra o que a demão TEM (nada), nunca o valor herdado: preenchido, um toque em
  // salvar transformaria a herança do jato em medição desta demão.
  expect(bloco(/Condições ambientais · 1ª demão \(fundo\)/i).getByLabelText("Umidade relativa (%)").value).toBe("");
});

it("a micragem seca mínima é do relatório e se ajusta pelo celular", () => {
  render(<Tela inicial={{ demaos: {}, espessuraMinima: "220", __espec: { espessuraMinima: "220" } }} />);
  const campo = screen.getByLabelText(/Micragem seca mínima/i);
  expect(campo.value).toBe("220");
  fireEvent.change(campo, { target: { value: "80" } });
  expect(salvo.espessuraMinima).toBe("80");
  // e é ELE que acende a leitura, não mais o número da obra
  expect(screen.getByText(/mínimo 80/)).toBeTruthy();
});
