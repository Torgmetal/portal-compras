import { beforeEach, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "pcp" }) }));
vi.mock("@/lib/fora-da-fabrica", () => ({ pecasNoTerceiro: vi.fn().mockResolvedValue(new Set()) }));
vi.mock("@/lib/entregue-expedicao", () => ({ marcasEntreguesAExpedicao: vi.fn().mockResolvedValue(new Set()), entregueAExpedicao: () => false, noRomaneioSemProducao: () => [] }));
vi.mock("@/lib/status-compra", () => ({ materialPorPerfil: vi.fn().mockResolvedValue(new Map()), statusCompraPorOp: vi.fn().mockResolvedValue(new Map()) }));
import { GET } from "@/app/api/pcp/despacho/route";

// Vitor (11/09/2026), OP-107: peça liberada pela GRD e sem ordem no Syneco saía "não programada"
// em vermelho, igual a peça que ninguém tocou. "Programada" continua vindo só do Syneco; o que
// muda é que a liberada sem ordem vira pendência de lançamento (LIBERADA_SEM_ORDEM).
const pecas = ["P1", "P2", "P3"].map((m, i) => ({ id: "p" + i, marca: m, fonte: "LPC_IMPORT", tipoPeca: "CROQUI", status: "PENDENTE", qte: 1, pesoTotalKg: 10, _count: { conjuntoCroquis: 0 } }));
beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findUnique.mockResolvedValue({ numero: "107", emProducao: true });
  mockPrisma.pecaConjunto.findMany.mockResolvedValue(pecas);
  mockPrisma.liberacaoProducao.findMany.mockResolvedValue([{ id: "l1", pecaIds: ["p0", "p1", "p2"], dataProgramada: null }]);
  for (const [model, method] of [["mesOrdem", "groupBy"], ["mesApontamento", "groupBy"], ["romaneioItem", "findMany"], ["conjuntoCroqui", "findMany"]]) mockPrisma[model][method].mockResolvedValue([]);
  // P1 tem GRD e nenhuma ordem; P2 tem ordem de preparação e nenhuma GRD; P3 não tem nada
  mockPrisma.grdLiberacao.findMany.mockResolvedValue([{ marca: "P1", formato: "A4", impressoes: 1, ultimaImpressaoEm: new Date("2026-09-11"), createdAt: new Date("2026-09-11"), liberadoPorNome: "Gabriel" }]);
  mockPrisma.mesOrdem.findMany.mockResolvedValue([{ item: "P2", setor: "Preparação", operacao: "10", maquina: "---", status: "Não Inicializada", planejadoUn: 1, produzidoUn: 0, pesoPlanejado: 10, dataInicio: null, dataFim: null, updatedAt: new Date() }]);
});

it("liberada pela GRD e sem ordem no Syneco é pendência de lançamento, não 'não programada'", async () => {
  const r = await GET(new Request("http://localhost/api/pcp/despacho?opId=op107&setor=CORTE"));
  expect(r.status).toBe(200);
  const j = await r.json();
  const sit = Object.fromEntries(j.pecas.map((p) => [p.marca, p.programacao.situacao]));
  expect(sit).toEqual({ P1: "LIBERADA_SEM_ORDEM", P2: "PROGRAMADA", P3: "NAO_LANCADA" });
  expect(j.pecas.find((p) => p.marca === "P1").grd.por).toBe("Gabriel");
});
