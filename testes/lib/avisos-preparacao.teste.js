import { expect, it } from "vitest";
import { avisosPreparacao } from "@/lib/avisos-preparacao";
it("não anuncia que uma marca sem desenho tem desenho", () => {
  const r = avisosPreparacao([{ marca: "A", qte: 3, temDesenho: false, temMaquina: false }]);
  expect(r.semDesenho).toMatchObject({ marcas: 1, quantidade: 3 });
  expect(r.semMaquina.marcas).toBe(0);
});
it("separa marcas com desenho mas sem máquina e ignora dados não conferidos", () => {
  const r = avisosPreparacao([{ marca: "A", qte: 4, temDesenho: true, temMaquina: false }, { marca: "B", qte: 10, temDesenho: null, temMaquina: null }]);
  expect(r.semMaquina).toMatchObject({ marcas: 1, quantidade: 4 });
  expect(r.semDesenho.marcas).toBe(0);
});
