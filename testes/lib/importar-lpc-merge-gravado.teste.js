// O RECIBO DA LPC vem dos counts que o banco devolveu em cada escrita do merge — não do diff, que é previsão.
// Aqui roda o importarLpcMerge DE VERDADE, com a transação simulada devolvendo { count } (nenhum banco).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { importarLpcMerge } from "@/lib/importar-lpc-merge";

const parsed = {
  opNumero: "T89A", obra: "BRACELL",
  conjuntos: [
    { marca: "T89A-B", descricao: "Viga", qte: 3, pesoUnitKg: 10, pesoTotalKg: 30 }, // qtd mudou → atualiza
    { marca: "T89A-C", descricao: "Coluna", qte: 1, pesoUnitKg: 50, pesoTotalKg: 50 }, // nova
    { marca: "T89A-D", descricao: "Coluna", qte: 1, pesoUnitKg: 50, pesoTotalKg: 50 }, // nova (a LE já tem → pulada)
  ],
  croquis: [], avulsas: [], relacoes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findFirst.mockResolvedValue(null); // sem OP: o backfill de opId (outro updateMany) não roda
  mockPrisma.pecaConjunto.findMany.mockImplementation(async ({ where }) => (where.fonte === "LPC_IMPORT"
    ? [
      { id: "a", marca: "T89A-A", status: "PENDENTE", qte: 1, qteProduzida: 0, pesoTotalKg: 10 }, // saiu → remove
      { id: "b", marca: "T89A-B", status: "PENDENTE", qte: 2, qteProduzida: 0, pesoTotalKg: 20 },
    ]
    : []));
  mockPrisma.pecaConjunto.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.pecaConjunto.updateMany.mockResolvedValue({ count: 1 });
  // skipDuplicates: pediu 2, o banco criou 1
  mockPrisma.pecaConjunto.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.conjuntoCroqui.createMany.mockResolvedValue({ count: 0 });
});

describe("importarLpcMerge — gravado", () => {
  it("soma os counts de cada escrita; createMany que pulou marca aparece como criados < adicionadas", async () => {
    const r = await importarLpcMerge(parsed, { userId: "u1", revisao: 2, arquivo: "T89A-LPC_R02.xlsx" });
    expect(r.adicionadas).toEqual(["T89A-C", "T89A-D"]);
    expect(r.alteradas).toEqual(["T89A-B"]);
    expect(r.removidas).toEqual(["T89A-A"]);
    expect(r.gravado).toEqual({ criados: 1, atualizados: 1, removidos: 1 });
  });

  it("escrita sem count (undefined) não vira NaN — conta zero", async () => {
    mockPrisma.pecaConjunto.deleteMany.mockResolvedValue(undefined);
    mockPrisma.pecaConjunto.updateMany.mockResolvedValue({});
    mockPrisma.pecaConjunto.createMany.mockResolvedValue({ count: 2 });
    const r = await importarLpcMerge(parsed, { userId: "u1", revisao: 2 });
    expect(r.gravado).toEqual({ criados: 2, atualizados: 0, removidos: 0 });
  });
});
