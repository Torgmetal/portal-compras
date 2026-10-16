// A montagem das linhas do Packing List da Valmet (Vitor, 16/10/2026). Decisões dele: Order Item = nº do volume; TAG = a
// marca da Torg; Valmet Code = "Desenho Valmet" da Lista de Equivalência; coluna Desenho em branco.
import { describe, expect, it } from "vitest";
import { montarPackingValmet, ehObraValmet, embalagemDaLinha } from "@/lib/packing-valmet";

const itens = [
  { marca: "T94A1", descricao: "COLUNA", qtd: 1, pesoKg: 591.88 },
  { marca: "T94A11", descricao: "VIGA", qtd: 3, pesoKg: 56.76 },
  { marca: "T94AC-4", descricao: "PARAFUSO SEXT. A325 - 1/2\"X1.1/4\" - GF", qtd: 190, pesoKg: 0 },
];
const equivalencia = new Map([["T94A1", { valmet: "MF01219515" }], ["T94A11", { valmet: "MF01219515" }]]);

describe("montarPackingValmet", () => {
  it("sem simulação: uma linha por marca, cada uma no seu volume, com Valmet Code e TAG = marca", () => {
    const r = montarPackingValmet({ itens, equivalencia });
    expect(r.linhas.map((l) => [l.item, l.volume, l.descricao, l.qtd, l.pesoKg, l.valmetCode, l.tag])).toEqual([
      [1, 1, "COLUNA", 1, 591.88, "MF01219515", "T94A1"],
      [2, 2, "VIGA", 3, 56.76, "MF01219515", "T94A11"],
      [3, 3, "PARAFUSO SEXT. A325 - 1/2\"X1.1/4\" - GF", 190, 0, null, "T94AC-4"],
    ]);
    expect(r.totais).toMatchObject({ kgLiquido: 648.64, kgBruto: 648.64, volumes: 3 });
  });

  it("marca fora da Lista de Equivalência sai sem Valmet Code e vira aviso, nomeando a marca", () => {
    const r = montarPackingValmet({ itens, equivalencia });
    expect(r.avisos.join(" ")).toMatch(/T94AC-4/);
  });

  it("com a simulação: Order Item = volume, medidas repetidas em toda linha do volume, bruto soma a madeira", () => {
    const volumes = [
      { dimsCm: [780, 40, 35], madeira: { caibro: 2 }, itens: [{ marca: "T94A1", qtd: 1 }, { marca: "T94A11", qtd: 2 }] },
      { dimsCm: [80, 100, 32], madeira: {}, itens: [{ marca: "T94A11", qtd: 1 }, { marca: "T94AC-4", qtd: 190 }] },
    ];
    const r = montarPackingValmet({ itens, volumes, equivalencia });
    expect(r.origem).toBe("simulacao");
    expect(r.linhas.map((l) => [l.volume, l.tag, l.qtd, l.dims])).toEqual([
      [1, "T94A1", 1, [780, 40, 35]], [1, "T94A11", 2, [780, 40, 35]],
      [2, "T94A11", 1, [80, 100, 32]], [2, "T94AC-4", 190, [80, 100, 32]],
    ]);
    expect(r.linhas[1].pesoKg).toBe(37.84);
    expect(r.totais.kgBruto).toBeGreaterThan(r.totais.kgLiquido);
    expect(r.totais.m3).toBeCloseTo(7.8 * 0.4 * 0.35 + 0.8 * 1 * 0.32, 3);
  });
});

describe("regras", () => {
  it("parafuso/porca/arruela vão em pallet, área coberta; peça de estrutura vai solta, área aberta (como o romaneio 01)", () => {
    expect(embalagemDaLinha("PORCA A563 - 1/2\" - GF - DEGRAU")).toEqual({ tipo: "Palette", armazenamento: "S2 Área coberta" });
    expect(embalagemDaLinha("COLUNA")).toEqual({ tipo: "Solta", armazenamento: "S1 Área aberta" });
    expect(embalagemDaLinha("CHUMBADOR")).toEqual({ tipo: "Solta", armazenamento: "S1 Área aberta" });
  });
  it("obra da Valmet pelo cliente da OP", () => {
    expect(ehObraValmet({ cliente: "VALMET" })).toBe(true);
    expect(ehObraValmet({ cliente: "VALMET CELULOSE PAPEL E ENERGIA" })).toBe(true);
    expect(ehObraValmet({ cliente: "TMSA" })).toBe(false);
  });
});
