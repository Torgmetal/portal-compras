// O esquema de pintura POR ESTRUTURA (Vitor, 15/10/2026): "no caso da tinta amarela ela recebe o primer e depois
// o acabamento amarelo, assim como a azul — no PLP isso não está claro e muito menos na folha do pintor".
// Demãos com o MESMO número são ALTERNATIVAS, escolhidas pela COR do item; demão sem alternativa vale para todos.
import { describe, it, expect } from "vitest";
import { esquemaPorEstrutura, numeroDeDemaos, problemasDoEsquema, mesmaCor } from "@/lib/plp-esquema";

// o PLP da OP-094, como está gravado
const PLP_094 = {
  demaos: [
    { ordem: 1, nome: "Primer", produto: "Jotamastic 90", cor: "Cinza" },
    { ordem: 3, nome: "Acabamento", produto: "Hardtop XP", cor: "Azul 2.5PB4/10" },
    { ordem: 3, nome: "Acabamento", produto: "Hardtop XP", cor: "Amarelo Segurança 5Y 8/12" },
  ],
  itens: [
    { item: "Estruturas Metálicas", cor: "Azul 2.5PB4/10" },
    { item: "Guarda Corpos", cor: "Amarelo Segurança 5Y 8/12" },
  ],
};

describe("esquema por estrutura", () => {
  it("cada estrutura leva o primer e o acabamento da SUA cor — 2 demãos, não 3", () => {
    const e = esquemaPorEstrutura(PLP_094);
    expect(e.map((x) => [x.item, x.demaos.map((d) => `${d.nome}:${d.cor}`)])).toEqual([
      ["Estruturas Metálicas", ["Primer:Cinza", "Acabamento:Azul 2.5PB4/10"]],
      ["Guarda Corpos", ["Primer:Cinza", "Acabamento:Amarelo Segurança 5Y 8/12"]],
    ]);
    expect(numeroDeDemaos(PLP_094)).toBe(2);
    expect(problemasDoEsquema(PLP_094)).toEqual([]);
  });

  it("obra de uma cor só, sem itens: um esquema único para todas as peças", () => {
    const e = esquemaPorEstrutura({ demaos: [{ ordem: 1, nome: "Primer" }, { ordem: 2, nome: "Acabamento", cor: "Cinza" }], itens: [] });
    expect(e).toHaveLength(1);
    expect(e[0].item).toMatch(/todas/i);
    expect(e[0].demaos).toHaveLength(2);
  });

  it("cor de item sem acabamento correspondente é problema, dito por item", () => {
    const plp = { ...PLP_094, itens: [...PLP_094.itens, { item: "Escadas", cor: "Preto N1" }] };
    expect(problemasDoEsquema(plp).join(" ")).toMatch(/Escadas.*Preto N1.*demão 3/i);
  });

  it("alternativas sem cor, ou com a mesma cor, não dá para escolher", () => {
    const semCor = { demaos: [{ ordem: 2, nome: "Acab", cor: "" }, { ordem: 2, nome: "Acab", cor: "Azul" }], itens: [{ item: "X", cor: "Azul" }] };
    expect(problemasDoEsquema(semCor).join(" ")).toMatch(/demão 2.*sem cor/i);
    const dup = { demaos: [{ ordem: 2, cor: "Azul" }, { ordem: 2, cor: "azul " }], itens: [{ item: "X", cor: "Azul" }] };
    expect(problemasDoEsquema(dup).join(" ")).toMatch(/demão 2.*mesma cor/i);
  });

  it("várias alternativas e nenhum item para escolher é problema", () => {
    expect(problemasDoEsquema({ demaos: PLP_094.demaos, itens: [] }).join(" ")).toMatch(/itens/i);
  });

  it("cor compara sem acento, caixa e espaço", () => {
    expect(mesmaCor("Amarelo Segurança 5Y 8/12", "AMARELO SEGURANCA 5Y 8/12")).toBe(true);
    expect(mesmaCor("Azul", "Amarelo")).toBe(false);
  });
});

import { consumoDoPlano } from "@/lib/consumo-tinta-plp";
describe("a tinta de cada acabamento sai da área da SUA cor", () => {
  const plp = {
    demaos: [
      { ordem: 1, nome: "Primer", cor: "Cinza", espessuraMin: 100, solidosVol: 50 },
      { ordem: 2, nome: "Acab", cor: "Azul", espessuraMin: 100, solidosVol: 50 },
      { ordem: 2, nome: "Acab", cor: "Amarelo", espessuraMin: 100, solidosVol: 50 },
    ],
    itens: [{ item: "Estrutura", cor: "Azul" }, { item: "Guarda-corpo", cor: "Amarelo" }],
  };
  it("primer na área toda; azul e amarelo cada um na sua", () => {
    const r = consumoDoPlano(plp, 100, {}, { areaPorCor: [{ cor: "Azul", m2: 70 }, { cor: "AMARELO", m2: 30 }] });
    const [primer, azul, amarelo] = r.camadas.map((c) => c.litros);
    expect(azul / primer).toBeCloseTo(0.7, 2);
    expect(amarelo / primer).toBeCloseTo(0.3, 2);
  });
  it("sem a área por cor, continua como antes (cada demão na área toda)", () => {
    const r = consumoDoPlano(plp, 100, {});
    expect(r.camadas[1].litros).toBe(r.camadas[0].litros);
  });
});

import { linhasDoEsquemaPdf } from "@/lib/plp-esquema";
describe("o quadro 'Esquema por estrutura' do PDF do PLP", () => {
  it("uma linha por estrutura com a sequência que ela recebe", () => {
    expect(linhasDoEsquemaPdf(PLP_094)).toEqual([
      ["Estruturas Metálicas", "Azul 2.5PB4/10", "1ª Primer — Jotamastic 90 (Cinza)\n2ª Acabamento — Hardtop XP (Azul 2.5PB4/10)"],
      ["Guarda Corpos", "Amarelo Segurança 5Y 8/12", "1ª Primer — Jotamastic 90 (Cinza)\n2ª Acabamento — Hardtop XP (Amarelo Segurança 5Y 8/12)"],
    ]);
  });
  it("demão que não deu para escolher aparece como pendência, não some", () => {
    const plp = { ...PLP_094, itens: [{ item: "Escadas", cor: "Preto N1" }] };
    expect(linhasDoEsquemaPdf(plp)[0][2]).toMatch(/demão 3: definir/i);
  });
  it("sem itens no PLP, nada (o quadro não aparece)", () => {
    expect(linhasDoEsquemaPdf({ demaos: PLP_094.demaos, itens: [] })).toEqual([]);
  });
});
