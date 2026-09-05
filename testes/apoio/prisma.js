import { vi } from "vitest";

// Mock do Prisma para testar código que consulta o banco sem chegar perto dele.
//
// Uso, no topo do arquivo de teste (o vi.mock sobe pro início do módulo):
//
//   import { mockPrisma } from "@/testes/apoio/prisma";
//   vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
//
//   mockPrisma.rM.findMany.mockResolvedValue([{ id: "1" }]);
//
// Qualquer modelo e qualquer método respondem: o proxy cria o mock na hora, então
// não é preciso listar os 80 modelos do schema aqui.
const metodo = () => vi.fn().mockResolvedValue(undefined);

function modelo() {
  const cache = {};
  return new Proxy({}, {
    get(_, prop) {
      if (typeof prop !== "string") return undefined;
      cache[prop] ??= metodo();
      return cache[prop];
    },
  });
}

const modelos = {};
export const mockPrisma = new Proxy({}, {
  get(_, prop) {
    if (typeof prop !== "string") return undefined;
    // $transaction recebe um array de promessas ou um callback
    if (prop === "$transaction") {
      return vi.fn(async (arg) =>
        typeof arg === "function" ? arg(mockPrisma) : Promise.all(arg)
      );
    }
    if (prop.startsWith("$")) {
      modelos[prop] ??= metodo();
      return modelos[prop];
    }
    modelos[prop] ??= modelo();
    return modelos[prop];
  },
});
