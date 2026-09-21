import { it, expect } from "vitest";
import { pisoDeclarado, aplicarPiso, acumuladoPorEtapa } from "@/lib/onde-obra-piso";

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

it("o bloco espelha as linhas de fase do cronograma: acumulado, com o % da linha e as peças medidas", () => {
  const dist = new Map([["Solda", { n: 48, kg: 5865 }], ["Acabamento", { n: 2, kg: 95 }], ["Jato", { n: 27, kg: 3290 }]]);
  const linhas = [
    { nome: "Corte", feito: 100 }, { nome: "Montagem", feito: 100 }, { nome: "Solda", feito: 100 }, { nome: "Jato", feito: 36 }, { nome: "Pintura", feito: 0 },
    { nome: "Recebimento dos Materiais", feito: 100 }, { nome: "Fabricação", feito: 50, isSummary: true },
  ];
  const r = acumuladoPorEtapa(dist, 9250, linhas);
  expect(r.map((e) => `${e.nome} ${e.pct}% ${e.pecas}pç`)).toEqual(["Preparação 100% 77pç", "Montagem 100% 77pç", "Solda 100% 77pç", "Jato 36% 27pç", "Pintura 0% 0pç"]);
  expect(r.every((e) => e.origem === "cronograma")).toBe(true);
});

it("sem linha de fase no cronograma, o acumulado é medido em todas as etapas com peça", () => {
  const dist = new Map([["Preparação", { n: 10, kg: 1000 }], ["Jato", { n: 5, kg: 1000 }]]);
  const r = acumuladoPorEtapa(dist, 2000, [{ nome: "Fabricação Lote 1", feito: 0 }]);
  expect(r.map((e) => `${e.nome} ${e.pct}%`)).toEqual(["Preparação 100%", "Montagem 50%", "Solda 50%", "Acabamento 50%", "Jato 50%"]);
  expect(r[0].origem).toBe("medido");
});
