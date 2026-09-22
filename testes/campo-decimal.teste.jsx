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

  // ─── O resíduo binário do banco não vai para dentro do campo (21/09/2026) ───
  //
  // ⚠⚠ MEDIDO NA PRODUÇÃO: `RMItem.peso` e `CotacaoItem.qtdCotada` da RM T122-001 guardam
  // `861.1199999999999`, e a tela do fornecedor mostrava `861,11999` num campo de 80 px — enquanto
  // a coluna ao lado, já arredondada, dizia `861.12 KG`.
  it("número do pai com resíduo binário aparece limpo", () => {
    render(<CampoDecimal value={861.1199999999999} onChange={() => {}} />);
    expect(screen.getByRole("textbox").value).toBe("861,12");
  });

  it("e o zero à direita do arredondamento não sobra", () => {
    render(<CampoDecimal value={957.6000000000001} onChange={() => {}} />);
    expect(screen.getByRole("textbox").value).toBe("957,6");
  });

  it("com casas={2}, o valor do pai chega com 2 casas", () => {
    render(<CampoDecimal value={6.7439} casas={2} onChange={() => {}} />);
    expect(screen.getByRole("textbox").value).toBe("6,74");
  });

  // ⚠⚠ SEM ISTO O CAMPO MOSTRARIA "1e-7" E O VALOR VIRARIA ZERO NA VOLTA — `numeroBR` não lê
  // expoente (achado do Codex).
  it("nunca devolve notação científica", () => {
    render(<CampoDecimal value={0.0000001} onChange={() => {}} />);
    const v = screen.getByRole("textbox").value;
    expect(v).not.toMatch(/e/i);
    expect(v).toBe("0");
  });

  // ⚠⚠ O CASO QUE O CODEX PEGOU. `limparDecimalDigitado` só capa depois da VÍRGULA, então
  // "0.1234567" passa inteiro. Se a decisão de trocar o texto usasse o valor ARREDONDADO, o pai
  // numérico devolveria "0,123457" — número diferente do digitado — e o campo se reescreveria no
  // meio da digitação. A decisão usa o valor CRU; só o que ENTRA no campo é arredondado.
  it("digitar com ponto além das casas não faz o campo se reescrever sozinho", () => {
    render(<PaiNumerico />);
    const inp = screen.getByRole("textbox");
    fireEvent.change(inp, { target: { value: "0.1234567" } });
    expect(inp.value).toBe("0.1234567");
    expect(screen.getByTestId("estado").textContent).toBe("0.1234567");
  });

  it("o zero à direita digitado continua protegido do arredondamento", () => {
    render(<PaiNumerico />);
    const inp = screen.getByRole("textbox");
    fireEvent.change(inp, { target: { value: "31,50" } });
    expect(inp.value).toBe("31,50");
  });

  // ⚠ O resíduo segue no BANCO: este campo conserta a apresentação, não o dado (achado do Codex).
  it("não avisa o pai do arredondamento — a gravação não muda sozinha", () => {
    const onChange = vi.fn();
    render(<CampoDecimal value={861.1199999999999} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
