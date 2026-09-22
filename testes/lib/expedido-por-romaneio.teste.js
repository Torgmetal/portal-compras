import { describe, it, expect } from "vitest";
import {
  numeroDoRomaneio, acumularRomaneio, totalExpedido, fundirExpedido,
} from "@/lib/expedido-por-romaneio";

// QUANTO DE CADA MARCA JÁ EMBARCOU — por romaneio, não por sim/não.
//
// Larissa (PCP, 22/09/2026), emitindo o romaneio da OP-067: "ele não reconheceu 3 peças T67F62,
// T67F65 e T67F80. Esses itens eram 2 peças de cada marca, e uma peça de cada foi enviada no
// romaneio 24, o portal entende que as peças já foram expedidas e não aparece para que eu possa
// selecionar, ou ele ignora quando subo a lista".

describe("o número que identifica o romaneio", () => {
  it("ignora a revisão e os zeros à esquerda — é a mesma carga", () => {
    expect(numeroDoRomaneio("14R1")).toBe("14");
    expect(numeroDoRomaneio("23 R1")).toBe("23");
    expect(numeroDoRomaneio("R13")).toBe("13");
    expect(numeroDoRomaneio("08")).toBe("8");
    expect(numeroDoRomaneio(24)).toBe("24");
  });
  it("sem dígito nenhum não é romaneio", () => {
    expect(numeroDoRomaneio("")).toBe(null);
    expect(numeroDoRomaneio(null)).toBe(null);
    expect(numeroDoRomaneio("R")).toBe(null);
  });
});

describe("acumular o que cada marca embarcou", () => {
  it("soma romaneios DIFERENTES", () => {
    const m = {};
    acumularRomaneio(m, { numero: "24", qtd: 1 });
    acumularRomaneio(m, { numero: "27", qtd: 2 });
    expect(m).toEqual({ 24: 1, 27: 2 });
    expect(totalExpedido(m)).toBe(3);
  });

  // ⚠⚠ Medido na pasta da OP-067: "08. ROMANEIO" e "09. ROMANEIO … R1" são o MESMO romaneio 08,
  // com os mesmos 22 itens; o mesmo vale para 14/15 e 21/22. Somar os arquivos dobraria a carga.
  it("o mesmo romaneio em dois arquivos (o original e o R1) conta UMA vez — o maior", () => {
    const m = {};
    acumularRomaneio(m, { numero: "08", qtd: 1 });
    acumularRomaneio(m, { numero: "08R1", qtd: 2 });
    expect(m).toEqual({ 8: 2 });
    expect(totalExpedido(m)).toBe(2);
  });

  it("linha sem quantidade vale 1 peça — é uma linha de romaneio, não um nada", () => {
    const m = {};
    acumularRomaneio(m, { numero: "24", qtd: null });
    expect(m).toEqual({ 24: 1 });
  });

  it("sem número de romaneio não acumula — não dá para saber de qual carga é", () => {
    const m = {};
    acumularRomaneio(m, { numero: "", qtd: 3 });
    expect(m).toEqual({});
  });
});

describe("fundir o que veio do arquivo com o que o portal emitiu", () => {
  // ⚠⚠ O ROMANEIO EMITIDO PELO PORTAL TAMBÉM É SALVO COMO FORM 22 NA PASTA. Na OP-067 o prévio 27
  // está emitido E existe "Romaneio R27 - OP-067 - DANPOWER.xlsx" na 4.2 Romaneios. Somar as duas
  // fontes contaria a mesma carga duas vezes.
  it("o mesmo romaneio nas duas fontes conta uma vez, com a quantidade do portal", () => {
    const fundido = fundirExpedido({ 24: 1, 27: 3 }, { 27: 2 });
    expect(fundido).toEqual({ 24: 1, 27: 2 });
    expect(totalExpedido(fundido)).toBe(3);
  });
  it("cada fonte sozinha continua valendo", () => {
    expect(totalExpedido(fundirExpedido({ 24: 1 }, null))).toBe(1);
    expect(totalExpedido(fundirExpedido(null, { 27: 2 }))).toBe(2);
    expect(totalExpedido(fundirExpedido(null, null))).toBe(0);
  });
});
