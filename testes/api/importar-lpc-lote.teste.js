// A rota da LPC grava em lote de ponta a ponta. Mike (25/09/2026), LPC da T118B: "HTTP 504 — o servidor
// demorou demais". Peça a peça, com o servidor em Washington e o banco em São Paulo, 1.240 peças
// esgotavam os 300 s e a lista ficava pela metade (22 ligações conjunto → croqui de centenas).
import { beforeEach, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1", name: "Mike" })) }));
vi.mock("@/lib/parse-lpc", () => ({
  parseLPC: vi.fn(() => ({
    opNumero: "T118B", obra: "CALDEIRA", cliente: "DANPOWER", pesoTotal: 124, areaTotal: 6,
    conjuntos: [{ marca: "T118B1", descricao: "COLUNA", qte: 1, pesoUnitKg: 100, pesoTotalKg: 100, areaPinturaM2: 3 }],
    croquis: [
      { marca: "T118B-P1", descricao: "W200X15", material: "A572", perfil: "W", qte: 1, comprimentoMm: 800, pesoUnitKg: 12, pesoTotalKg: 12, areaPinturaM2: 0.6 },
      { marca: "T118B-P2", descricao: "CH9.5X100", material: "A36", perfil: "CH", qte: 4, comprimentoMm: 100, pesoUnitKg: 3, pesoTotalKg: 12, areaPinturaM2: 0.1 },
    ],
    avulsas: [],
    relacoes: [
      { conjuntoMarca: "T118B1", croquiMarca: "T118B-P1", qtdNoConjunto: 1 },
      { conjuntoMarca: "T118B1", croquiMarca: "T118B-P2", qtdNoConjunto: 4 },
    ],
  })),
}));
import { POST } from "@/app/api/producao/pecas/importar-lpc/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findFirst.mockResolvedValue({ id: "op118", numero: "118" });
  // a leitura das que já existem traz o conjunto; as demais consultas de antes não têm nada
  mockPrisma.pecaConjunto.findMany.mockImplementation(async ({ where }) => (where?.marca?.in ? [{ id: "id-B1", marca: "T118B1", statusPrep: null, maquina: null }] : []));
  mockPrisma.pecaConjunto.createManyAndReturn.mockImplementation(async ({ data }) => data.map((d) => ({ id: `id-${d.marca}`, marca: d.marca })));
  mockPrisma.pecaConjunto.update.mockResolvedValue({});
  mockPrisma.conjuntoCroqui.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.conjuntoCroqui.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
  mockPrisma.liberacaoProducao.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("importa em lote: sem busca por peça, as ligações de uma vez, e o recibo com os números", async () => {
  const r = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ rows: [["x"]], arquivoNome: "T118B-LPC_R00.xlsx" }) }));
  const j = await r.json();
  expect(r.status).toBe(200);
  expect(mockPrisma.pecaConjunto.findUnique).not.toHaveBeenCalled();
  expect(mockPrisma.pecaConjunto.createManyAndReturn).toHaveBeenCalledTimes(1);
  expect(mockPrisma.conjuntoCroqui.create).not.toHaveBeenCalled();
  expect(mockPrisma.conjuntoCroqui.createMany.mock.calls[0][0].data).toEqual([
    { conjuntoId: "id-B1", croquiId: "id-T118B-P1", qtdNoConjunto: 1 },
    { conjuntoId: "id-B1", croquiId: "id-T118B-P2", qtdNoConjunto: 4 },
  ]);
  expect(j).toMatchObject({ ok: true, opNumero: "T118B", criados: 2, atualizados: 1, ignorados: 0, relacoes: 2 });
  const audit = mockPrisma.auditLog.create.mock.calls.find(([x]) => x.data.action === "IMPORTAR_LPC")[0].data;
  expect(audit.diff).toMatchObject({ criados: 2, atualizados: 1, relacoes: 2 });
});
