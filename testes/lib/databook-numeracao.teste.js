// A §18 ("RNCs e concessões") saiu em 16/06/2026 e o índice ficou 17 → 19 → 20. Vitor (28/09/2026):
// "só deixa certo do 1 ao 19". O número que se LÊ passa a ser 1 a 19; o número interno (seção no
// banco, vínculos, pastas, volumes) não muda. Data book fechado antes disso segue como foi entregue.
import { describe, it, expect } from "vitest";
import { numeroExibido, usaNumeracaoSem18, ESTADOS_FECHADOS_DATABOOK } from "@/lib/databook-secoes";

const antes = new Date("2026-09-20T12:00:00-03:00");
const depois = new Date("2026-10-05T12:00:00-03:00");

describe("numeroExibido — o índice do data book vai de 1 a 19", () => {
  it("em montagem, 19 (calibração) aparece como 18 e 20 (termo) como 19", () => {
    const book = { status: "EM_MONTAGEM", emitidoEm: null };
    expect(numeroExibido("19", book)).toBe("18");
    expect(numeroExibido("20", book)).toBe("19");
  });

  it("de 01 a 17 nada muda", () => {
    const book = { status: "EM_MONTAGEM", emitidoEm: null };
    for (const n of ["01", "02", "10", "17"]) expect(numeroExibido(n, book)).toBe(n);
  });

  it("sem o data book (lista do modelo) já mostra a numeração nova", () => {
    expect(numeroExibido("20")).toBe("19");
  });

  it("fechado ANTES da mudança continua como foi assinado e entregue", () => {
    for (const status of ["EMITIDO", "EM_ASSINATURA", "ENVIADO_CLIENTE", "ACEITO"]) {
      const book = { status, emitidoEm: antes };
      expect(numeroExibido("19", book)).toBe("19");
      expect(numeroExibido("20", book)).toBe("20");
    }
  });

  it("aceito sem data de emissão (dado antigo, como o da OP-114) também segue como foi entregue", () => {
    expect(numeroExibido("20", { status: "ACEITO", emitidoEm: null })).toBe("20");
  });

  it("emitido DEPOIS da mudança já nasce com a numeração nova e não volta", () => {
    expect(numeroExibido("20", { status: "EMITIDO", emitidoEm: depois })).toBe("19");
    expect(numeroExibido("20", { status: "ACEITO", emitidoEm: depois })).toBe("19");
  });

  it("em revisão (a revisão zera a emissão) passa para a numeração nova", () => {
    expect(usaNumeracaoSem18({ status: "EM_MONTAGEM", emitidoEm: null, revisao: 1 })).toBe(true);
  });

  it("a data vem como texto da API (JSON) e funciona igual", () => {
    expect(numeroExibido("20", { status: "ACEITO", emitidoEm: antes.toISOString() })).toBe("20");
    expect(numeroExibido("20", { status: "ACEITO", emitidoEm: depois.toISOString() })).toBe("19");
  });

  it("os estados fechados são os mesmos da revisão (uma lista só)", () => {
    expect([...ESTADOS_FECHADOS_DATABOOK].sort()).toEqual(["ACEITO", "EMITIDO", "EM_ASSINATURA", "ENVIADO_CLIENTE"]);
  });
});
