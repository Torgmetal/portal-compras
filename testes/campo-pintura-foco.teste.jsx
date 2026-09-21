// @vitest-environment jsdom
// "clicar número por número" (Vitor, 14/09/2026): o lote da tinta perdia o foco a cada tecla porque o
// campo era um componente definido dentro do componente-pai (identidade nova a cada render → o React
// desmontava o <input>). O teste digita dois caracteres e confere que o MESMO elemento continua focado.
import React from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useComponenteEstavel } from "@/lib/react-estavel";
import Pintura from "@/app/campo/Pintura";

beforeEach(() => { globalThis.React = React; }); // os .jsx do app usam o runtime clássico no vitest
afterEach(cleanup);

function Pai() {
  const [v, setV] = React.useState("");
  const Campo = useComponenteEstavel(({ rot }) => <input aria-label={rot} value={v} onChange={(e) => setV(e.target.value)} />);
  return <Campo rot="Lote" />;
}

it("useComponenteEstavel: digitar não desmonta o input — o foco fica", () => {
  render(<Pai />);
  const inp = screen.getByLabelText("Lote"); inp.focus();
  fireEvent.change(inp, { target: { value: "1" } });
  expect(screen.getByLabelText("Lote")).toBe(inp);
  expect(document.activeElement).toBe(inp);
  fireEvent.change(inp, { target: { value: "12" } });
  expect(screen.getByLabelText("Lote").value).toBe("12");
  expect(document.activeElement).toBe(inp);
});

it("relatório de pintura do campo: o lote da tinta digitado aguenta a segunda tecla sem perder o foco", () => {
  function Tela() {
    const [cond, setCond] = React.useState({ demaos: {} });
    return <Pintura cond={cond} setCond={setCond} tintas={[]} plp={null} />;
  }
  render(<Tela />);
  const inp = screen.getAllByPlaceholderText("lote 1 · lote 2")[0]; inp.focus();
  fireEvent.change(inp, { target: { value: "L" } });
  const depois = screen.getAllByPlaceholderText("lote 1 · lote 2")[0];
  expect(depois).toBe(inp);
  expect(document.activeElement).toBe(inp);
  fireEvent.change(depois, { target: { value: "L7" } });
  expect(screen.getAllByPlaceholderText("lote 1 · lote 2")[0].value).toBe("L7");
});
