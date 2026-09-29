import { describe, it, expect } from "vitest";
import { pendenciasParaAssinatura } from "@/lib/qualidade-campo";

// Geraldo (29/09/2026): os RIP-089-002 e 003 foram DUAS VEZES para assinatura com o procedimento da
// preparação, o horário final das demãos e a inspeção visual em branco — e voltaram das duas, pelo
// assinante. A checagem de antes do envio só olhava cotas e quantitativo; para pintura, nada. Vitor:
// "é uma boa isso mesmo não deixar ir para assinatura sem esses campos preenchidos".

const demao = (extra = {}) => ({
  produto: "Barrier 80 S Grey", fabricante: "Jotun", cor: "Grey", metodo: "Airless",
  loteA: "4366598-1-*-1:2", data: "2026-09-02", hIni: "13:00", hFim: "17:00", visual: "APROVADO", ...extra,
});
const pintura = (resultados) => ({ tipo: "PINTURA", linhas: [], resultados });
const PREPARO = "Procedimento de preparo em branco (Preparação da superfície).";

describe("pendências do relatório de pintura antes da assinatura", () => {
  it("o RIP-089-003 como foi enviado: procedimento, horário final das três e visual da 2ª e da 3ª", () => {
    const res = {
      prepProcedimento: null,
      demaos: {
        1: demao({ hFim: undefined }),
        2: demao({ hFim: undefined, visual: undefined, hIni: "08:00" }),
        3: demao({ hFim: undefined, visual: undefined, hIni: "08:00" }),
      },
    };
    expect(pendenciasParaAssinatura(pintura(res))).toEqual([
      PREPARO,
      "Horário final em branco nas demãos 1ª, 2ª e 3ª.",
      "Inspeção visual em branco nas demãos 2ª e 3ª.",
    ]);
  });

  it("relatório completo pode ir para assinatura", () => {
    const res = { prepProcedimento: "Jateamento abrasivo", demaos: { 1: demao(), 2: demao(), 3: demao() } };
    expect(pendenciasParaAssinatura(pintura(res))).toEqual([]);
  });

  // ⚠ o relatório NASCE com produto, fabricante, cor e método nas demãos previstas (PLP e memória da
  // OP). Cobrar horário de uma demão só por isso barraria o relatório que cobre apenas o fundo.
  it("demão só com o que o relatório já nasce trazendo não foi aplicada — não é cobrada", () => {
    const res = {
      prepProcedimento: "Jateamento abrasivo",
      demaos: { 1: demao(), 2: { produto: "PENGUARD", fabricante: "JOTUN", cor: "LITE GREY", metodo: "Airless" }, 3: { metodo: "Airless" } },
    };
    expect(pendenciasParaAssinatura(pintura(res))).toEqual([]);
  });

  it("demão com leitura de espessura foi aplicada — cobra data, horários e visual", () => {
    const res = { prepProcedimento: "Jateamento abrasivo", demaos: { 1: demao(), 2: { metodo: "Airless" } }, espessuras: { 2: [120, null, null, null, null] } };
    expect(pendenciasParaAssinatura(pintura(res))).toEqual([
      "Data de aplicação em branco na 2ª demão.",
      "Horário inicial em branco na 2ª demão.",
      "Horário final em branco na 2ª demão.",
      "Inspeção visual em branco na 2ª demão.",
    ]);
  });

  it("espaço em branco é campo vazio", () => {
    const res = { prepProcedimento: "   ", demaos: { 1: demao({ hFim: "  " }) } };
    expect(pendenciasParaAssinatura(pintura(res))).toEqual([PREPARO, "Horário final em branco na 1ª demão."]);
  });

  it("sem nada gravado, cobra o procedimento e nenhuma demão", () => {
    expect(pendenciasParaAssinatura({ tipo: "PINTURA" })).toEqual([PREPARO]);
  });

  it("os outros tipos sem cota seguem como estavam", () => {
    for (const tipo of ["LP", "ULTRASSOM", "VISUAL_SOLDA"]) {
      expect(pendenciasParaAssinatura({ tipo, resultados: { demaos: { 1: { data: "2026-09-02" } } } })).toEqual([]);
    }
  });
});
