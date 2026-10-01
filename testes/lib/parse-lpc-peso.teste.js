// O template novo do Tekla 2025 ("02 TORG_Lista de peças por conj" — T105D, T120B, T124A; 29 e
// 30/09/2026) escreve PESO TOTAL = (2·QTDE − 1) × PESO UNIT em toda posição com mais de uma peça, e o
// peso do conjunto soma esses totais. A T124A entrou no portal com 29.614 kg contra 21.255 kg da LE.
// O unitário está certo (bate com a LP e com a LE): o importador passa a CONFERIR a conta.
import { describe, it, expect } from "vitest";
import { parseLPC } from "@/lib/parse-lpc";

const CAB = [["CLIENTE: STAHLDACH"], ["OBRA: SHOPPING CENTER NORTE"], ["POSIÇÃO", "QTDE", "", "MATERIAL", "DESCRIÇÃO", "COMPR. (mm)", "PESO UNIT. (Kg)", "PESO TOTAL (Kg)", "ÁREA (m²)"]];
const conj = (marca, qte, unit, total) => [marca, qte, "", null, "COLUNA", null, unit, total, 1];
const pos = (marca, qte, unit, total) => [marca, qte, "", "A572-50", "CH 8", 300, unit, total, 0.1];

describe("peso da LPC: a conta manda quando a planilha erra", () => {
  it("template novo: posição volta a qtde × unitário e o conjunto vira a soma das posições", () => {
    // T124A1 real: P4 4 × 1,03 saía 7,23; o conjunto, 97,18 em vez de ~88
    const rows = [...CAB,
      conj("T124A1", 1, 14.30, 14.30),
      pos("T124A-P4", 4, 1.03, 7.21), // (2·4 − 1) × 1,03
      pos("T124A-P5", 1, 3.0, 3.0),
      pos("T124A-P6", 2, 1.5, 4.5), // (2·2 − 1) × 1,5
    ];
    const r = parseLPC(rows, { opNumeroForcado: "T124A" });
    const p4 = r.croquis.find((c) => c.marca === "T124A-P4");
    expect(p4.pesoTotalKg).toBeCloseTo(4.12, 2);
    const c1 = r.conjuntos[0];
    expect(c1.pesoUnitKg).toBeCloseTo(4.12 + 3.0 + 3.0, 2);
    expect(c1.pesoTotalKg).toBeCloseTo(10.12, 2);
    expect(r.pesoTotal).toBeCloseTo(10.12, 2);
    expect(r.correcaoPeso).toMatchObject({ linhas: 2, conjuntos: 1 });
    expect(r.correcaoPeso.planilhaKg).toBeCloseTo(14.3, 1);
    expect(r.correcaoPeso.contaKg).toBeCloseTo(10.12, 1);
  });

  it("conjunto com mais de uma unidade: a qtde da posição já soma as unidades — o unitário sai da divisão", () => {
    // T124A4 real: 2 unidades, posições somam 318,5 kg → 159,25 cada (a LE diz 159,30)
    const rows = [...CAB, conj("T124A4", 2, 13.0, 26.0), pos("T124A-P9", 3, 2.0, 10.0), pos("T124A-P10", 1, 1.0, 1.0)];
    const r = parseLPC(rows, { opNumeroForcado: "T124A" });
    expect(r.conjuntos[0].pesoTotalKg).toBeCloseTo(7.0, 2);
    expect(r.conjuntos[0].pesoUnitKg).toBeCloseTo(3.5, 2);
  });

  it("peça avulsa errada também é corrigida", () => {
    const rows = [...CAB, ["PEÇAS AVULSAS"], pos("T124A-P20", 5, 2.0, 18.0)];
    const r = parseLPC(rows, { opNumeroForcado: "T124A" });
    expect(r.avulsas[0].pesoTotalKg).toBeCloseTo(10.0, 2);
    expect(r.correcaoPeso.linhas).toBe(1);
  });

  it("template antigo (conta certa): nada muda — nem o conjunto que difere da soma por arredondamento", () => {
    const rows = [...CAB, conj("T118B1", 1, 88.08, 88.08), pos("T118B-P1", 4, 10.0, 40.0), pos("T118B-P2", 2, 24.025, 48.05)];
    const r = parseLPC(rows, { opNumeroForcado: "T118B" });
    expect(r.conjuntos[0].pesoUnitKg).toBe(88.08);
    expect(r.croquis.map((c) => c.pesoTotalKg)).toEqual([40.0, 48.05]);
    expect(r.correcaoPeso).toBeNull();
  });

  it("diferença de arredondamento na posição não conta como erro", () => {
    const rows = [...CAB, conj("T118B2", 1, 4.13, 4.13), pos("T118B-P3", 4, 1.0325, 4.13)];
    const r = parseLPC(rows, { opNumeroForcado: "T118B" });
    expect(r.croquis[0].pesoTotalKg).toBe(4.13);
    expect(r.correcaoPeso).toBeNull();
  });

  it("sem peso unitário, o total da planilha fica (não há conta para conferir)", () => {
    const rows = [...CAB, conj("T124A7", 1, 5, 5), pos("T124A-P30", 2, 0, 5)];
    const r = parseLPC(rows, { opNumeroForcado: "T124A" });
    expect(r.croquis[0].pesoTotalKg).toBe(5);
    expect(r.correcaoPeso).toBeNull();
  });
});
