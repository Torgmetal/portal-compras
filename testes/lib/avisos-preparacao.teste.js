import { expect, it } from "vitest";
import { avisosPreparacao, materialResolvido } from "@/lib/avisos-preparacao";
it("material na OP ou estoque com R definido não entra no aviso de falta de material", () => {
  expect(materialResolvido({ material: "NA_OP" })).toBe(true);
  expect(materialResolvido({ material: "ENTREGUE" })).toBe(true);
  expect(materialResolvido({ material: "ESTOQUE", materialRInformado: "261234" })).toBe(true);
  expect(materialResolvido({ material: "ESTOQUE" })).toBe(false);
  expect(materialResolvido({ material: "SEM_MATERIAL" })).toBe(false);
});
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
