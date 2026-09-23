import { it, expect } from "vitest";
import { quantidadesPorMarca } from "@/lib/inspecao-pecas";

// A QUANTIDADE DO RELATÓRIO NÃO PODE SOMAR A LE COM A LPC.
//
// Agente da OP-84 (23/09/2026): os RID-084-001/002 saíram com 8/2/2/4/2 peças quando os desenhos e
// a lista dizem 4/1/1/2/1. Cada marca tem uma linha da Lista de Expedição (`LE_IMPORT`, opNumero
// "084") e outra da LPC (`LPC_IMPORT`, opNumero "T84A") — a MESMA estrutura vista de dois jeitos —,
// e a soma crua contava as duas. A régua já existia: `pecasReais` (lib/peso-op.js).

const LINHAS_OP84 = [
  { marca: "T84A1", qte: 4, fonte: "LE_IMPORT", naLE: true, tipoPeca: null, pesoTotalKg: 120 },
  { marca: "T84A1", qte: 4, fonte: "LPC_IMPORT", naLE: false, tipoPeca: "CONJUNTO", pesoTotalKg: 120 },
  { marca: "T84A2", qte: 1, fonte: "LE_IMPORT", naLE: true, tipoPeca: null, pesoTotalKg: 900 },
  { marca: "T84A2", qte: 1, fonte: "LPC_IMPORT", naLE: false, tipoPeca: "CONJUNTO", pesoTotalKg: 900 },
  { marca: "T84A2-P1", qte: 6, fonte: "LPC_IMPORT", naLE: false, tipoPeca: "CROQUI", pesoTotalKg: 30 },
];

it("com a LE importada, conta pela LE — nunca LE + LPC", () => {
  expect(quantidadesPorMarca(LINHAS_OP84)).toEqual({ T84A1: 4, T84A2: 1 });
});

it("sem LE, conta pela LPC, sem croqui", () => {
  const soLpc = LINHAS_OP84.filter((l) => l.fonte === "LPC_IMPORT");
  expect(quantidadesPorMarca(soLpc)).toEqual({ T84A1: 4, T84A2: 1 });
});

it("marca que aparece em mais de um conjunto da MESMA lista continua somando", () => {
  expect(quantidadesPorMarca([
    { marca: "P1", qte: 6, fonte: "LPC_IMPORT", tipoPeca: "CONJUNTO", pesoTotalKg: 1 },
    { marca: "P1", qte: 4, fonte: "LPC_IMPORT", tipoPeca: "CONJUNTO", pesoTotalKg: 1 },
  ])).toEqual({ P1: 10 });
});
