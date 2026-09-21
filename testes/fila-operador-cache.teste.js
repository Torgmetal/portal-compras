import { it, expect, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({
  prisma: {
    oP: { findMany: vi.fn(async () => []) },
    pecaConjunto: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/gantt-pcp", () => ({ lotesProgramados: vi.fn(async () => []) }));
import { lotesProgramados } from "@/lib/gantt-pcp";
import {
  carregarFilaOperador,
  invalidarFilaOperador,
} from "@/lib/fila-operador-servidor";
it("invalida após remanejo e força leitura atual em refresh de outra instância", async () => {
  invalidarFilaOperador();
  vi.clearAllMocks();
  await carregarFilaOperador();
  await carregarFilaOperador();
  expect(lotesProgramados).toHaveBeenCalledTimes(1);
  invalidarFilaOperador();
  await carregarFilaOperador();
  expect(lotesProgramados).toHaveBeenCalledTimes(2);
  await carregarFilaOperador({ atualizar: true });
  expect(lotesProgramados).toHaveBeenCalledTimes(3);
});
it("consulta antiga em andamento não restaura cache invalidado", async () => {
  invalidarFilaOperador();
  vi.clearAllMocks();
  let terminar;
  lotesProgramados.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        terminar = resolve;
      }),
  );
  const antiga = carregarFilaOperador();
  const nova = await carregarFilaOperador({ atualizar: true });
  terminar([{ op: "velha", itens: [] }]);
  await antiga;
  expect(await carregarFilaOperador()).toBe(nova);
});
