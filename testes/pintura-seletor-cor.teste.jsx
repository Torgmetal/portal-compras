// @vitest-environment jsdom
// A COR APLICADA NÃO PODE FICAR PRESA AO PLP.
//
// Matheus (29/09/2026), na RIP-094-001: "está faltando para montar o relatório as cores de tinta:
// Azul 2.5PB4/10 e Cinza N6,5". A tela só oferecia as cores do PLP da obra (Cinza, Cinza RAL 7039,
// Amarelo 5Y 8/12) e não havia como escrever outra — o relatório saía sem a cor que foi pintada.
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SeletorCor from "@/components/SeletorCor";
import Pintura from "@/app/campo/Pintura";

beforeEach(() => { globalThis.React = React; });
afterEach(cleanup);

const CORES = ["Cinza RAL 7039", "Amarelo Segurança 5Y 8/12"];

function Solo({ inicial = "" }) {
  const [v, setV] = React.useState(inicial);
  return <><SeletorCor rotulo="Cor aplicada" valor={v} cores={CORES} onMudar={setV} /><output>{v}</output></>;
}

describe("SeletorCor", () => {
  it("lista as cores do PLP e escolhe uma", () => {
    render(<Solo />);
    fireEvent.change(screen.getByLabelText("Cor aplicada"), { target: { value: "Cinza RAL 7039" } });
    expect(screen.getByRole("status").textContent).toBe("Cinza RAL 7039");
  });

  it("'Outra cor…' vira campo de texto e grava o que se digita", () => {
    render(<Solo />);
    fireEvent.change(screen.getByLabelText("Cor aplicada"), { target: { value: "__outra__" } });
    const campo = screen.getByLabelText("Cor aplicada");
    expect(campo.tagName).toBe("INPUT");
    fireEvent.change(campo, { target: { value: "Azul 2.5PB4/10" } });
    expect(screen.getByRole("status").textContent).toBe("Azul 2.5PB4/10");
  });

  it("⚠ cor já gravada fora do PLP abre em texto — não some num select que não a conhece", () => {
    render(<Solo inicial="Cinza N6,5" />);
    const campo = screen.getByLabelText("Cor aplicada");
    expect(campo.tagName).toBe("INPUT");
    expect(campo.value).toBe("Cinza N6,5");
  });

  it("volta para a lista do PLP, limpando o texto", () => {
    render(<Solo inicial="Cinza N6,5" />);
    fireEvent.click(screen.getByRole("button", { name: /cores do PLP/ }));
    expect(screen.getByLabelText("Cor aplicada").tagName).toBe("SELECT");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("sem cor no PLP, é texto direto e sem botão de voltar", () => {
    render(<SeletorCor rotulo="Cor aplicada" valor="" cores={[]} onMudar={() => {}} />);
    expect(screen.getByLabelText("Cor aplicada").tagName).toBe("INPUT");
    expect(screen.queryByRole("button", { name: /cores do PLP/ })).toBeNull();
  });
});

describe("no celular (campo)", () => {
  let salvo;
  function Tela() {
    const [cond, setCond] = React.useState({ demaos: {} });
    salvo = cond;
    return <Pintura cond={cond} setCond={setCond} plp={{ itens: CORES.map((cor) => ({ cor })), demaos: [] }} />;
  }

  it("a demão aceita uma cor fora do PLP", () => {
    render(<Tela />);
    fireEvent.change(screen.getByLabelText("Cor aplicada"), { target: { value: "__outra__" } });
    fireEvent.change(screen.getByLabelText("Cor aplicada"), { target: { value: "Azul 2.5PB4/10" } });
    expect(salvo.demaos["1"].cor).toBe("Azul 2.5PB4/10");
  });
});

it("⚠ o PLP que chega DEPOIS do primeiro render vira lista (a tela da Qualidade carrega assim)", () => {
  const { rerender } = render(<SeletorCor rotulo="Cor aplicada" valor="" cores={[]} onMudar={() => {}} />);
  expect(screen.getByLabelText("Cor aplicada").tagName).toBe("INPUT");
  rerender(<SeletorCor rotulo="Cor aplicada" valor="" cores={CORES} onMudar={() => {}} />);
  expect(screen.getByLabelText("Cor aplicada").tagName).toBe("SELECT");
});

it("apagar o texto de uma cor fora do PLP não devolve o campo à lista no meio da digitação", () => {
  render(<Solo inicial="Cinza N6,5" />);
  fireEvent.change(screen.getByLabelText("Cor aplicada"), { target: { value: "" } });
  expect(screen.getByLabelText("Cor aplicada").tagName).toBe("INPUT");
});
