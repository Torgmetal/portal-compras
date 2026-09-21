// @vitest-environment jsdom
// O componente, não só a função de limpeza.
//
// ⚠⚠ O QUE ESTE ARQUIVO EXISTE PARA PEGAR: metade das telas guarda NÚMERO no estado
// (`onChange={(txt) => setDias(numeroBR(txt))}`). Se o campo fosse controlado direto pelo pai, ao
// teclar a vírgula de "31,5" o pai guardaria 31, devolveria "31" e a vírgula sumiria da tela antes
// do próximo dígito — o campo ficaria impossível de usar justamente para decimais, que é o defeito
// que ele veio consertar.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import CampoDecimal from "@/components/CampoDecimal";
import { numeroBR } from "@/lib/numero-br";

/** Pai que guarda NÚMERO — o caso perigoso. */
function PaiNumerico({ inicial = "" }) {
  const [v, setV] = useState(inicial);
  return (
    <>
      <CampoDecimal value={v} onChange={(txt) => setV(numeroBR(txt))} />
      <span data-testid="estado">{String(v)}</span>
    </>
  );
}

/** Pai que guarda TEXTO — o outro caso. */
function PaiTextual() {
  const [v, setV] = useState("");
  return (
    <>
      <CampoDecimal value={v} onChange={setV} />
      <span data-testid="estado">{String(v)}</span>
    </>
  );
}

beforeEach(() => { globalThis.React = React; });
afterEach(() => cleanup());

const digitar = (campo, texto) => {
  for (const t of texto) fireEvent.change(campo, { target: { value: campo.value + t } });
};

describe("CampoDecimal", () => {
  it("a vírgula sobrevive mesmo quando o pai guarda NÚMERO", () => {
    render(<PaiNumerico />);
    const campo = screen.getByRole("textbox");
    digitar(campo, "31,5");
    expect(campo.value).toBe("31,5");
    expect(screen.getByTestId("estado").textContent).toBe("31.5");
  });

  it("o zero à direita não é apagado enquanto se digita", () => {
    render(<PaiNumerico />);
    const campo = screen.getByRole("textbox");
    digitar(campo, "31,50");
    expect(campo.value).toBe("31,50");   // 31,5 e 31,50 são o mesmo número; o texto é de quem digita
    digitar(campo, "8");
    expect(campo.value).toBe("31,508");
  });

  it("guardando texto, o valor chega limpo ao pai", () => {
    render(<PaiTextual />);
    const campo = screen.getByRole("textbox");
    digitar(campo, "R$ 31,02");
    expect(campo.value).toBe("31,02");
    expect(screen.getByTestId("estado").textContent).toBe("31,02");
  });

  it("até 6 casas, e o resto é cortado", () => {
    render(<PaiTextual />);
    const campo = screen.getByRole("textbox");
    digitar(campo, "0,1234567");
    expect(campo.value).toBe("0,123456");
  });

  // ⚠ Quem manda de fora (reset, cálculo automático, preenchimento por IA) continua mandando.
  it("valor novo vindo de fora substitui o que está na tela", () => {
    const { rerender } = render(<CampoDecimal value={10} onChange={() => {}} />);
    expect(screen.getByRole("textbox").value).toBe("10");
    rerender(<CampoDecimal value={25.5} onChange={() => {}} />);
    expect(screen.getByRole("textbox").value).toBe("25,5");
    rerender(<CampoDecimal value="" onChange={() => {}} />);
    expect(screen.getByRole("textbox").value).toBe("");
  });

  it("número do pai aparece com vírgula, não com ponto", () => {
    render(<CampoDecimal value={1234.56} onChange={() => {}} />);
    expect(screen.getByRole("textbox").value).toBe("1234,56");
  });

  it("o teclado do celular continua numérico", () => {
    render(<CampoDecimal value="" onChange={() => {}} />);
    expect(screen.getByRole("textbox").getAttribute("inputmode")).toBe("decimal");
  });

  it("repassa as props do input (placeholder, disabled, className)", () => {
    render(<CampoDecimal value="" onChange={() => {}} placeholder="0,00" disabled className="w-20" />);
    const campo = screen.getByPlaceholderText("0,00");
    expect(campo.disabled).toBe(true);
    expect(campo.className).toBe("w-20");
  });

  it("não chama onChange sozinho ao receber valor de fora", () => {
    const espiao = vi.fn();
    const { rerender } = render(<CampoDecimal value={1} onChange={espiao} />);
    rerender(<CampoDecimal value={2} onChange={espiao} />);
    expect(espiao).not.toHaveBeenCalled();
  });
});
