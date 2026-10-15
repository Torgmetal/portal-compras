// A aba Produção da OP mostrava parafusos e grades de piso (Vitor, 15/10/2026: "itens que não são fabricados na
// Torg não devem aparecer nessas listas de produção"). A rota partia de TODAS as marcas da Lista de Expedição (que
// tem 100% dos itens, de propósito) sem a regra da casa, `ehItemComprado` (lib/item-comprado.js).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u" }) }));
import { GET } from "@/app/api/comercial/op/[id]/producao/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op89", numero: "089" });
  mockPrisma.listaExpedicao.findMany.mockResolvedValue([{ frente: "A", marcasJson: [
    { marca: "T89A1", descricao: "COLUNA", qte: 2, pesoTotal: 500 },
    { marca: "PAR-01", descricao: "PARAFUSO SEXT 3/4 A325", qte: 300, pesoTotal: 0 },
    { marca: "T89G1", descricao: "GRADE DE PISO 25X100", qte: 12, pesoTotal: 340 },
    { marca: "T89A50", descricao: "PAINEL", qte: 4, pesoTotal: 120 }, // material GS na LPC = grade
  ] }]);
  mockPrisma.romaneioPrevio.findMany.mockResolvedValue([]);
  mockPrisma.baixaExpedicao.findMany.mockResolvedValue([]);
  mockPrisma.mesOrdem.groupBy.mockResolvedValue([]);
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([
    { marca: "T89A1", tipoPeca: "CONJUNTO", material: "A572-50", perfil: "W200X26.6" },
    { marca: "T89A50", tipoPeca: null, material: "GS_A4_304", perfil: "CH30.00X1292" },
  ]);
});

describe("aba Produção da OP: só o que a Torg fabrica", () => {
  it("parafuso, grade de piso (pelo nome e pelo material GS) ficam fora — e a tela sabe quantos", async () => {
    const j = await (await GET(new Request("http://localhost"), { params: { id: "op89" } })).json();
    expect(j.pecas.map((p) => p.marca)).toEqual(["T89A1"]);
    expect(j.total).toBe(1);
    expect(j.pesoTotal).toBe(500);
    expect(j.itensComprados).toBe(3);
  });
});
