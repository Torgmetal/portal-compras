// ⚠⚠ O QUE ESTE ARQUIVO CONGELA: `<input type="number">` DESCARTA a vírgula. Medido no Chromium em
// pt-BR e en-US (15/09/2026): "31,02" → value "3102"; "31,020" → "31020"; "0,000001" → "0000001".
// Não é arredondamento nem locale — é o separador sumindo e os dígitos se colando. Quem digitava
// R$ 31,02 lançava R$ 3.102,00. Foi o defeito que o Matheus viu na proposta manual da RM: 31,020 de
// quantidade × R$ 10 dando R$ 310.200,00.
import { describe, it, expect } from "vitest";
import { limparDecimalDigitado, CASAS_PADRAO } from "@/lib/decimal-digitado";
import { numeroBR } from "@/lib/numero-br";

const limpar = limparDecimalDigitado;

describe("limparDecimalDigitado", () => {
  it("a vírgula ATRAVESSA — é o conserto inteiro em uma linha", () => {
    expect(limpar("31,020")).toBe("31,020");
    expect(numeroBR(limpar("31,020"))).toBe(31.02);
    expect(numeroBR(limpar("31,02"))).toBe(31.02);
  });

  it("aceita 6 casas depois da vírgula, e corta a partir daí", () => {
    expect(limpar("0,000001")).toBe("0,000001");
    expect(numeroBR(limpar("0,000001"))).toBe(0.000001);
    expect(limpar("1,1234567")).toBe("1,123456");
    expect(limpar("1,123456789")).toBe("1,123456");
  });

  it("o limite de casas é por campo — dinheiro pede 2", () => {
    expect(limpar("31,029", 2)).toBe("31,02");
    expect(limpar("1.234,5678", 2)).toBe("1.234,56");
  });

  // ⚠ Depois de PONTO não se corta: "1.234.567" é milhar, e cortar mutilaria o número em vez de
  // limitar a precisão. Quem escreve o decimal com ponto cai na regra de `numeroBR`.
  it("não mexe no separador de milhar", () => {
    expect(limpar("1.234.567")).toBe("1.234.567");
    expect(limpar("1.234,56")).toBe("1.234,56");
    expect(numeroBR(limpar("1.234,56"))).toBe(1234.56);
  });

  it("descarta letra, símbolo e espaço — colar 'R$ 1.234,56/kg' funciona", () => {
    expect(limpar("R$ 1.234,56/kg")).toBe("1.234,56");
    expect(numeroBR(limpar("R$ 1.234,56/kg"))).toBe(1234.56);
  });

  it("o sinal fica só na frente", () => {
    expect(limpar("-31,02")).toBe("-31,02");
    expect(limpar("31-,02")).toBe("31,02");
    expect(limpar("--31")).toBe("-31");
  });

  // ⚠⚠ DUAS VÍRGULAS SÃO DUAS COISAS DIFERENTES, e confundi-las multiplica o valor por cem sem
  // ninguém ver: no milhar americano toda vírgula separa exatamente três dígitos; fora desse
  // desenho, a segunda é tecla a mais.
  it("vírgula a mais é engano de digitação — a primeira é o decimal", () => {
    expect(limpar("1,2,3")).toBe("1,23");
    expect(numeroBR(limpar("1,2,3"))).toBe(1.23);
    expect(limpar("31,0,2")).toBe("31,02");
  });

  it("mas o milhar americano colado de um PDF sobrevive inteiro", () => {
    expect(limpar("1,234,567")).toBe("1,234,567");
    expect(numeroBR(limpar("1,234,567"))).toBe(1234567);
  });

  it("vazio, nulo e só separador não quebram", () => {
    for (const v of ["", null, undefined, ",", "."]) expect(typeof limpar(v)).toBe("string");
    expect(limpar("")).toBe("");
    expect(limpar(",")).toBe(",");        // quem começou a digitar "0," ainda está digitando
    expect(numeroBR(limpar(","))).toBe(0);
  });

  // ⚠ Digitar é incremental: cada estado intermediário tem de sobreviver, senão o cursor pula e a
  // pessoa perde a conta do que escreveu.
  it("os estados intermediários de quem está digitando sobrevivem", () => {
    let txt = "";
    for (const tecla of "31,020") {
      txt = limpar(txt + tecla);
    }
    expect(txt).toBe("31,020");
  });

  it("o padrão do portal são 6 casas", () => {
    expect(CASAS_PADRAO).toBe(6);
  });
});
