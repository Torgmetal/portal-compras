// O formato da folha sai do TAMANHO da página, não do nome da pasta (OP-094, 16/09/2026).
import { describe, it, expect } from "vitest";
import { formatoDaFolha, formatoDoPdf } from "@/lib/formato-folha";

const mm = (v) => (v * 72) / 25.4;

describe("formatoDaFolha — ISO 216 pelo tamanho da página", () => {
  it("reconhece A0–A4 em pé e deitado", () => {
    expect(formatoDaFolha(mm(594), mm(841))).toBe("A1");
    expect(formatoDaFolha(mm(841), mm(594))).toBe("A1");
    expect(formatoDaFolha(mm(420), mm(297))).toBe("A3");
    expect(formatoDaFolha(mm(210), mm(297))).toBe("A4");
    expect(formatoDaFolha(mm(1189), mm(841))).toBe("A0");
    expect(formatoDaFolha(mm(594), mm(420))).toBe("A2");
  });

  it("tolera o arredondamento do MediaBox e a margem de plotagem (6 %)", () => {
    expect(formatoDaFolha(595.28, 841.89)).toBe("A4"); // A4 em pontos, como o pdf-lib devolve
    expect(formatoDaFolha(841.89, 1190.55)).toBe("A3");
    expect(formatoDaFolha(mm(600), mm(850))).toBe("A1");
    expect(formatoDaFolha(mm(300), mm(430))).toBe("A3");
  });

  it("tamanho que não é ISO devolve null — quem chama decide", () => {
    expect(formatoDaFolha(mm(216), mm(356))).toBeNull(); // ofício
    expect(formatoDaFolha(mm(1000), mm(1000))).toBeNull();
    expect(formatoDaFolha(0, mm(297))).toBeNull();
    expect(formatoDaFolha(NaN, undefined)).toBeNull();
  });

  it("formatoDoPdf lê a primeira página e engole documento vazio ou quebrado", () => {
    const doc = (w, h, n = 1) => ({ getPageCount: () => n, getPage: () => ({ getSize: () => ({ width: w, height: h }) }) });
    expect(formatoDoPdf(doc(mm(420), mm(297)))).toBe("A3");
    expect(formatoDoPdf(doc(mm(420), mm(297), 0))).toBeNull();
    expect(formatoDoPdf(null)).toBeNull();
    expect(formatoDoPdf({ getPageCount: () => { throw new Error("x"); } })).toBeNull();
  });
});
