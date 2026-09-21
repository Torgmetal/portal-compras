import { it, expect } from "vitest";
import { pecasReais, contagemRealPecas, pesoRealPecas } from "@/lib/peso-op";
import { ehItemComprado } from "@/lib/item-comprado";

// A OP-103 em miniatura: LPC (conjunto, avulsa e croqui) e LE do mesmo aço, chaves diferentes.
const LPC = [
  { fonte: "LPC_IMPORT", naLPC: true, naLE: false, tipoPeca: "CONJUNTO", qte: 4, pesoTotalKg: 400 },
  { fonte: "LPC_IMPORT", naLPC: true, naLE: false, tipoPeca: null, qte: 30, pesoTotalKg: 60 },
  { fonte: "LPC_IMPORT", naLPC: true, naLE: false, tipoPeca: "CROQUI", qte: 40, pesoTotalKg: 400 },
];
const LE = [
  { fonte: "LE_IMPORT", naLPC: false, naLE: true, tipoPeca: null, qte: 4, pesoTotalKg: 400 },
  { fonte: "LE_IMPORT", naLPC: false, naLE: true, tipoPeca: null, qte: 28, pesoTotalKg: 56 },
];

it("com LE, conta e pesa só a LE — nunca LPC + LE somadas (o 854 da OP-103)", () => {
  expect(contagemRealPecas([...LPC, ...LE])).toBe(32);
  expect(pesoRealPecas([...LPC, ...LE])).toBe(456);
});

it("parafuso (marca AC) não conta como peça; grade e degrau contam", () => {
  const le = [...LE, { fonte: "LE_IMPORT", naLE: true, marca: "T83-AC1", qte: 5000, pesoTotalKg: 0 }, { fonte: "LE_IMPORT", naLE: true, marca: "T83AG1", qte: 10, pesoTotalKg: 600, descricao: "GRADE" }];
  expect(contagemRealPecas(le)).toBe(42);
});

it("sem LE, conta a LPC sem croqui", () => {
  expect(contagemRealPecas(LPC)).toBe(34);
  expect(pesoRealPecas(LPC)).toBe(460);
});

it("a LE vale pela flag naLE mesmo quando a linha nasceu pela LPC (chave única)", () => {
  const juntas = [{ fonte: "LPC_IMPORT", naLPC: true, naLE: true, tipoPeca: "CONJUNTO", qte: 2, pesoTotalKg: 200 }, LPC[2]];
  expect(pecasReais(juntas)).toHaveLength(1);
  expect(contagemRealPecas(juntas)).toBe(2);
});

it("calha de saída de resíduos (chute) é fabricada; calha galvalume é comprada", () => {
  expect(ehItemComprado({ descricao: "CALHA SAIDA RESIDUOS GROSSOS", pesoTotalKg: 100.72 })).toBe(false);
  expect(ehItemComprado({ descricao: "CALHA SAIDA MENOR RESIDUOS GROSSOS", pesoTotalKg: 47.6 })).toBe(false);
  expect(ehItemComprado({ descricao: "CALHA GALVALUME 0.65MM (CONFORME DESENHO C1)", pesoTotalKg: 12 })).toBe(true);
  expect(ehItemComprado({ descricao: "SUPORTE CALHA", pesoTotalKg: 30 })).toBe(false);
});
