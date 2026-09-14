// Planilha de correção do Syneco: o que o portal deu baixa menos o que o Syneco já registrou, por marca e setor.
import { beforeEach, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { apontamentosParaSyneco, baixaDoPortal } from "@/lib/apontamentos-syneco";

const op = { numero: "094", obra: "BRACELL", cliente: "VALMET" };
const pecas = [
  // baixa parcial de 10 no corte; Syneco tem 4 → lançar 6
  { id: "a", opId: "op1", opNumero: "T94A", marca: "T94A-P1", descricao: "CHAPA", perfil: "CH4.80", qte: 18, pesoUnitKg: 2, baixaSetores: { CORTE: { qtd: 10, porNome: "Larissa", em: "2026-09-12T10:00:00Z" } }, op },
  // baixa sem qtd = marca inteira (5); Syneco já tem 5 → nada
  { id: "b", opId: "op1", opNumero: "T94A", marca: "T94A-P2", descricao: "VIGA", perfil: "W200", qte: 5, pesoUnitKg: 10, baixaSetores: { MONTAGEM: { em: "2026-09-12T10:00:00Z" } }, op },
  // baixa de 3 na solda, Syneco 0 → lançar 3
  { id: "c", opId: "op1", opNumero: "T94A", marca: "T94A3", descricao: "CONJUNTO", perfil: null, qte: 3, pesoUnitKg: 50, baixaSetores: { SOLDA: { qtd: 3, porNome: "Gabriel", em: "2026-09-13T10:00:00Z" } }, op },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.pecaConjunto.findMany.mockResolvedValue(pecas);
  mockPrisma.mesOrdem.groupBy.mockImplementation(async ({ where }) => {
    const setor = JSON.stringify(where).toLowerCase();
    if (setor.includes("corte")) return [{ opId: "op1", item: "T94A-P1", _sum: { produzidoUn: 4 } }];
    if (setor.includes("montag")) return [{ opId: "op1", item: "T94A-P2", _sum: { produzidoUn: 5 } }];
    return [];
  });
});

it("lança só o saldo (baixa do portal − Syneco), com a obra no código do Syneco e o peso do que falta", async () => {
  const r = await apontamentosParaSyneco({});
  expect(r.linhas.map((l) => [l.setor, l.marca, l.noPortal, l.noSyneco, l.aLancar, l.pesoALancarKg])).toEqual([
    ["CORTE", "T94A-P1", 10, 4, 6, 12],
    ["SOLDA", "T94A3", 3, 0, 3, 150],
  ]);
  expect(r.linhas[0]).toMatchObject({ obraSyneco: "T94A", opNumero: "094", setorSyneco: "Corte", baixadoPor: "Larissa" });
  expect(r.total).toMatchObject({ linhas: 2, pecas: 9, kg: 162, ops: 1, setores: 2 });
});

it("filtro por setor só consulta aquele setor; setor inexistente é erro", async () => {
  const r = await apontamentosParaSyneco({ setor: "SOLDA" });
  expect(r.linhas.map((l) => l.marca)).toEqual(["T94A3"]);
  expect(mockPrisma.mesOrdem.groupBy).toHaveBeenCalledTimes(1);
  await expect(apontamentosParaSyneco({ setor: "EXPEDICAO" })).rejects.toThrow(/Setor sem correspondente/);
});

it("baixaDoPortal: sem qtd é a marca inteira, e nunca passa da quantidade da marca", () => {
  expect(baixaDoPortal({ qte: 5, baixaSetores: { CORTE: {} } }, "CORTE").qtd).toBe(5);
  expect(baixaDoPortal({ qte: 5, baixaSetores: { CORTE: { qtd: 9 } } }, "CORTE").qtd).toBe(5);
  expect(baixaDoPortal({ qte: 5, baixaSetores: {} }, "CORTE").qtd).toBe(0);
});
