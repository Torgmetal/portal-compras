import { it, expect } from "vitest";
import { pisoDeclarado, aplicarPiso } from "@/lib/onde-obra-piso";

// OP-102 (15/09/2026): Corte/Montagem/Solda 100% à mão; Jato 36% e Pintura 0% do Syneco.
const tarefas = [
  { nome: "Corte", avancoManual: true, percentualRealizado: 100 },
  { nome: "Montagem", avancoManual: true, percentualRealizado: 100 },
  { nome: "Solda", avancoManual: true, percentualRealizado: 100 },
  { nome: "Jato", avancoManual: false, percentualRealizado: 36.3 },
  { nome: "Pintura", avancoManual: false, percentualRealizado: 100 }, // automático: não conta
  { nome: "Recebimento dos Materiais", avancoManual: true, percentualRealizado: 100 }, // não é fase
];

it("o piso é a fase mais avançada declarada 100% à mão — automático e não-fase não contam", () => {
  expect(pisoDeclarado(tarefas)).toBe("Solda");
  expect(pisoDeclarado([{ nome: "Fabricação Lote 1", avancoManual: true, percentualRealizado: 100 }])).toBeNull();
  expect(pisoDeclarado([])).toBeNull();
});

it("peças atrás do piso (e não iniciadas) sobem até ele; as da frente ficam", () => {
  const dist = new Map([["Preparação", { n: 19, kg: 600 }], ["Montagem", { n: 7, kg: 2400 }], ["Solda", { n: 22, kg: 2865 }], ["Acabamento", { n: 2, kg: 95 }], ["Jato", { n: 27, kg: 3290 }]]);
  const r = aplicarPiso(dist, { n: 3, kg: 100 }, "Solda");
  expect([...r.dist.keys()]).toEqual(["Solda", "Acabamento", "Jato"]);
  expect(r.dist.get("Solda")).toEqual({ n: 51, kg: 5965 });
  expect(r.naoIniciada).toEqual({ n: 0, kg: 0 });
  expect(dist.get("Preparação")).toEqual({ n: 19, kg: 600 }); // original intacto
});

it("sem piso, nada muda", () => {
  const dist = new Map([["Preparação", { n: 1, kg: 10 }]]);
  const r = aplicarPiso(dist, { n: 2, kg: 20 }, null);
  expect(r.dist.get("Preparação")).toEqual({ n: 1, kg: 10 });
  expect(r.naoIniciada).toEqual({ n: 2, kg: 20 });
});
