import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { rastreioDaOp } from "@/lib/rastreio-peca";

// A OP-089 em miniatura: um croqui de perfil W cortado depois da entrega (ganha R) e uma grade de
// piso comprada pronta, que o Tekla escreve como chapa de 30 mm ("CH30.00X1292", material GS_A4_304)
// e que nunca casa com o CMR — não é peça de fábrica, não entra na conta do "sem R".
beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.documentoQualidade.findMany.mockResolvedValue([
    { importRef: "260792", nome: "PERFIL W ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 15,0KG/M", numeroCorrida: "2815", numeroDocumento: "c1", norma: "A572", fornecedor: "SOUFER", pedidoCompra: null, nfNumero: null, dataRecebimento: new Date("2026-06-10"), pesoKg: 4860 },
  ]);
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([
    { marca: "T89A-P1", perfil: "W200X15", qte: 2, pesoTotalKg: 120, pesoUnitKg: 60, tipoPeca: "CROQUI", fonte: "LPC_IMPORT", corteConcluidoEm: new Date("2026-07-01"), dataProducao: null, material: "A572-GR.50", descricao: "W200X15" },
    { marca: "T89AG1", perfil: "CH30.00X1292", qte: 4, pesoTotalKg: 236, pesoUnitKg: 59, tipoPeca: "CROQUI", fonte: "LPC_IMPORT", corteConcluidoEm: null, dataProducao: null, material: "GS_A4_304", descricao: "GRADE" },
  ]);
  mockPrisma.mesOrdem.findMany.mockResolvedValue([]);
  mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([]);
});

it("grade de piso comprada não entra no rastreio — nem como 'sem material'", async () => {
  const r = await rastreioDaOp("089", "op089");
  expect(r.porMarca.has("T89AG1")).toBe(false);
  expect(r.porMarca.get("T89A-P1")?.situacao).toBe("R_DEFINIDO");
  expect(r.resumo.semMaterial).toBe(0);
  expect(r.resumo.pecas).toBe(1);
});

it("OP só com item comprado devolve o vazio, sem quebrar", async () => {
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([
    { marca: "T89AG1", perfil: "CH30.00X1292", qte: 4, pesoTotalKg: 236, pesoUnitKg: 59, tipoPeca: "CROQUI", fonte: "LPC_IMPORT", material: "GS_A4_304", descricao: "GRADE" },
  ]);
  const r = await rastreioDaOp("089", "op089");
  expect(r.porMarca.size).toBe(0);
  expect(r.resumo.pecas).toBe(0);
});
