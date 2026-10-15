// Romaneio no modelo da TMSA (FOR-081) — Vitor, 15/10/2026: só nas obras TMSA; tipo "Volume 1, Volume 2…"; dimensões
// dos pacotes da simulação; peso bruto = peças + madeira; TAG = número da TMSA; quantidade = o que vai de fato; código =
// a OC da TAG; descrição = nome da peça + marca Torg; referência = TPR / OP; numeração 1, 2, 3 por OP.
import { describe, it, expect } from "vitest";
import { ehObraTmsa, referenciaProjeto, pesoMadeiraKg, montarRomaneioTmsa, KG_M3_MADEIRA } from "@/lib/romaneio-tmsa";

const itens = [
  { marca: "105A3", descricao: "COLUNA", qtd: 4, pesoKg: 400 },
  { marca: "105B1", descricao: "VIGA", qtd: 2, pesoKg: 60 },
];
const tags = new Map([["105A3", [{ unidade: 1, tag: "TC 4706" }, { unidade: 2, tag: "TC 4706" }, { unidade: 3, tag: "TC 4707" }, { unidade: 4, tag: "TC 4707" }]], ["105B1", [{ unidade: 1, tag: "TC 4706" }]]]);
const ocPorTag = new Map([["TC4706", "231297-1"], ["TC4707", "231300-2"]]);

describe("quem e o cabeçalho", () => {
  it("só obra da TMSA", () => {
    expect(ehObraTmsa({ cliente: "TMSA Tecnologia em movimentação" })).toBe(true);
    expect(ehObraTmsa({ cliente: "DANPOWER" })).toBe(false);
  });
  it("referência = TPR / OP", () => {
    expect(referenciaProjeto("TPR00751", "122")).toBe("TPR00751 / OP-122");
    expect(referenciaProjeto(null, "122")).toBe("OP-122");
  });
  it("madeira em kg pela média de eucalipto e pinus", () => {
    expect(KG_M3_MADEIRA).toBe(625);
    // 2 caibros (3 m, 5×6) + 1 tábua (0,9 m², 2,5 cm)
    expect(pesoMadeiraKg({ caibro: 2, sarrafo: 0, tabua: 1 })).toBeCloseTo(2 * 3 * 0.05 * 0.06 * 625 + 0.9 * 0.025 * 625, 1);
  });
});

describe("seguindo a simulação", () => {
  const volumes = [
    { volume: 1, dimsCm: [620, 110, 45], madeira: { caibro: 4, sarrafo: 0, tabua: 0 }, itens: [{ marca: "105A3", qtd: 3 }] },
    { volume: 2, dimsCm: [300, 80, 40], madeira: { caibro: 2, sarrafo: 0, tabua: 0 }, itens: [{ marca: "105A3", qtd: 1 }, { marca: "105B1", qtd: 2 }] },
  ];
  const r = montarRomaneioTmsa({ itens, volumes, tags, ocPorTag });
  it("um volume por embalagem, tipo 'VOLUME n', com as medidas", () => {
    expect(r.embalagens.map((e) => [e.numero, e.tipo, e.dims])).toEqual([[1, "VOLUME 1", [620, 110, 45]], [2, "VOLUME 2", [300, 80, 40]]]);
  });
  it("as peças da marca vão em ordem de unidade, e cada TAG vira uma linha com a SUA OC", () => {
    expect(r.embalagens[0].linhas).toEqual([
      { tag: "TC 4706", qtd: 2, codigo: "231297-1", descricao: "COLUNA — 105A3" },
      { tag: "TC 4707", qtd: 1, codigo: "231300-2", descricao: "COLUNA — 105A3" },
    ]);
    expect(r.embalagens[1].linhas[0]).toEqual({ tag: "TC 4707", qtd: 1, codigo: "231300-2", descricao: "COLUNA — 105A3" });
  });
  it("peça sem TAG na lista de equivalência sai sem TAG, nunca herdada de outra unidade", () => {
    expect(r.embalagens[1].linhas[1]).toMatchObject({ qtd: 1, tag: "TC 4706" });
    expect(r.embalagens[1].linhas[2]).toMatchObject({ qtd: 1, tag: null, codigo: null, descricao: "VIGA — 105B1" });
  });
  it("líquido = peças; bruto = líquido + madeira; totais", () => {
    expect(r.embalagens[0].kgLiquido).toBe(300);
    expect(r.embalagens[0].kgBruto).toBeCloseTo(300 + pesoMadeiraKg({ caibro: 4 }), 1);
    expect(r.totais).toMatchObject({ embalagens: 2, kgLiquido: 460 });
    expect(r.origem).toBe("simulacao");
  });
});

describe("sem simulação (ou simulação de outra lista)", () => {
  it("um volume por marca, sem medida, bruto = líquido — e diz por quê", () => {
    const r = montarRomaneioTmsa({ itens, volumes: null, tags, ocPorTag });
    expect(r.embalagens.map((e) => [e.tipo, e.dims, e.kgLiquido, e.kgBruto])).toEqual([["VOLUME 1", null, 400, 400], ["VOLUME 2", null, 60, 60]]);
    expect(r.origem).toBe("manual");
  });
  it("simulação que não bate com as quantidades emitidas não é usada", () => {
    const r = montarRomaneioTmsa({ itens, volumes: [{ volume: 1, dimsCm: [1, 1, 1], madeira: {}, itens: [{ marca: "105A3", qtd: 4 }] }], tags, ocPorTag });
    expect(r.origem).toBe("manual");
    expect(r.avisos.join(" ")).toMatch(/simula/i);
  });

  it("simulação antiga (sem contagem por marca) ainda vale nos volumes de UMA marca: a quantidade é a do volume", () => {
    const vs = [{ volume: 1, dimsCm: [600, 100, 40], madeira: {}, marcas: ["105A3"], pecas: 4 }, { volume: 2, dimsCm: [300, 90, 40], madeira: {}, marcas: ["105B1"], pecas: 2 }];
    const r = montarRomaneioTmsa({ itens, volumes: vs, tags, ocPorTag });
    expect(r.origem).toBe("simulacao");
    expect(r.embalagens[0].dims).toEqual([600, 100, 40]);
  });
  it("simulação antiga com volume de VÁRIAS marcas não tem como dividir: pede para simular de novo", () => {
    const vs = [{ volume: 1, dimsCm: [600, 100, 40], madeira: {}, marcas: ["105A3", "105B1"], pecas: 6 }];
    const r = montarRomaneioTmsa({ itens, volumes: vs, tags, ocPorTag });
    expect(r.origem).toBe("manual");
    expect(r.avisos.join(" ")).toMatch(/simula/i);
  });
});
