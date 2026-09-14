import { describe, it, expect } from "vitest";
import { GRADE } from "@/lib/etiqueta-carregamento-pdf";

// ─── A GRADE DO MODELO PADRÃO ────────────────────────────────────────────────
//
// Números de posição não têm como se testar "de olho" num PDF — mas as RELAÇÕES entre eles têm, e
// é delas que os defeitos vêm. Estes testes guardam as que já foram quebradas de verdade.

describe("o cabeçalho é uma faixa só, de ponta a ponta", () => {
  // ⚠⚠ Matheus (14/09/2026): "preciso que o QR CODE fique abaixo da linha vermelha para alinhar o
  // cabeçalho com campo O.P.". A divisória da coluna da direita estava em 8 e a do endereço em 15:
  // a célula do O.P. terminava sete milímetros acima, e o QR começava DENTRO da faixa do cabeçalho
  // — o traço que atravessa a etiqueta passava por cima do código.
  it("a divisória do O.P. está na mesma altura da do endereço", () => {
    expect(GRADE.yOP).toBe(GRADE.yCabecalho);
  });

  it("e as duas ficam acima da linha do CLIENTE", () => {
    expect(GRADE.yCabecalho).toBeLessThan(GRADE.yCliente);
  });
});

describe("o QR cabe na célula dele, com a legenda", () => {
  const LADO = 12.5;          // o mesmo valor do desenho
  const GAP = 1.2;
  const topo = GRADE.yOP + GAP;
  const base = topo + LADO;

  it("começa abaixo da faixa do cabeçalho", () => {
    expect(topo).toBeGreaterThan(GRADE.yCabecalho);
  });

  // ⚠ A legenda (a marca, repetida sob o QR) tem a base em `yObra - 1,6`; o texto sobe dali. Com o
  // QR de 14 mm ele encostava nela — e encostar, na térmica, é o mesmo que borrar.
  it("termina antes de a legenda começar", () => {
    const topoDaLegenda = GRADE.yObra - 1.6 - 2.2;
    expect(base).toBeLessThan(topoDaLegenda);
  });

  it("não invade a linha que atravessa a etiqueta", () => {
    expect(base).toBeLessThan(GRADE.yObra);
  });
});
