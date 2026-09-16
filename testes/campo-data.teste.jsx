// @vitest-environment jsdom
// O CampoData pelo lado do CALENDÁRIO, que é o caminho que ninguém testava.
//
// ⚠⚠ O QUE ESTE ARQUIVO EXISTE PARA PEGAR: o handler do `<input type="date">` escondido tratava o
// primeiro argumento do onChange como se já fosse o ISO — mas ele é o EVENTO do React.
// `isoParaBR(evento)` vira "[object Ob", a regex não casa e devolve "": escolher uma data no
// calendário APAGAVA o campo e mandava o objeto do evento ao pai, que o gravaria como data.
// A digitação sempre funcionou, e foi por isso que o defeito passou (16/09/2026).
import React, { useState } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CampoData from "@/components/CampoData";

/** Pai que guarda o ISO, como as telas fazem. */
function Pai({ inicial = "" }) {
  const [v, setV] = useState(inicial);
  return (
    <>
      <CampoData value={v} onChange={setV} />
      <span data-testid="estado">{String(v)}</span>
    </>
  );
}

const campoTexto = () => screen.getByPlaceholderText("dd/mm/aaaa");
const campoNativo = () => document.querySelector('input[type="date"]');

beforeEach(() => {
  // ⚠ O botão do calendário e o input nativo só existem quando `showPicker` existe — o componente
  // checa isso no `window`. Sem esta linha o jsdom não os renderiza e o teste não testa nada.
  if (!("showPicker" in window.HTMLInputElement.prototype)) {
    window.HTMLInputElement.prototype.showPicker = () => {};
  }
});
afterEach(cleanup);

describe("CampoData — digitação", () => {
  it("mascara em dd/mm/aaaa e devolve ISO ao pai", () => {
    render(<Pai />);
    fireEvent.change(campoTexto(), { target: { value: "16092026" } });
    expect(campoTexto().value).toBe("16/09/2026");
    expect(screen.getByTestId("estado").textContent).toBe("2026-09-16");
  });

  it("mostra em pt-BR o valor que chega em ISO", () => {
    render(<Pai inicial="2026-08-19" />);
    expect(campoTexto().value).toBe("19/08/2026");
  });
});

describe("CampoData — o calendário do sistema", () => {
  it("⚠⚠ escolher no calendário PREENCHE o campo, não o apaga", () => {
    render(<Pai />);
    fireEvent.change(campoNativo(), { target: { value: "2026-09-16" } });
    expect(campoTexto().value).toBe("16/09/2026");
  });

  it("⚠⚠ e manda o ISO ao pai, não o objeto do evento", () => {
    render(<Pai />);
    fireEvent.change(campoNativo(), { target: { value: "2026-09-16" } });
    const estado = screen.getByTestId("estado").textContent;
    expect(estado).toBe("2026-09-16");
    expect(estado).not.toContain("object");
  });

  it("trocar a data pelo calendário substitui a que estava digitada", () => {
    render(<Pai inicial="2026-08-19" />);
    fireEvent.change(campoNativo(), { target: { value: "2026-12-25" } });
    expect(campoTexto().value).toBe("25/12/2026");
    expect(screen.getByTestId("estado").textContent).toBe("2026-12-25");
  });
});
