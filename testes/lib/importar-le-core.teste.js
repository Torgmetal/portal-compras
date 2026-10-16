// CARACTERIZAÇÃO do import da LE: congela o que a rota `importar-le` devolve e grava HOJE, para a
// extração da lógica para `lib/importar-le-core.js` não mudar nada no caminho. Se um snapshot daqui
// mudar numa refatoração, o errado é a refatoração (mesma regra dos testes do `calcularLqc`).
//
// Cenário: três linhas — uma marca nova (create), uma que já existe na LE (update) e uma cujo create
// bate no @@unique (P2002 → "já na outra lista"/ignorada) —, mais o rodapé "TOTAL.:" que não é peça.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1", name: "Vitor" })) }));
vi.mock("@/lib/parse-le-form21", () => ({
  parseFormularioLE: vi.fn(() => ({
    opNumero: "89", obra: "BRACELL",
    pecas: [
      { item: 1, marca: "T89C1", descricao: "VIGA", qte: 2, pesoUnitKg: 50, pesoTotalKg: 100, fluxoEspecial: null, observacao: null },
      { item: 2, marca: "T89C2", descricao: "COLUNA", qte: 1, pesoUnitKg: 80, pesoTotalKg: 80, fluxoEspecial: null, observacao: "GALV" },
      { item: 3, marca: "T89C3", descricao: "TERCA", qte: 4, pesoUnitKg: 10, pesoTotalKg: 40, fluxoEspecial: null, observacao: null },
      { item: 4, marca: "TOTAL.:", qte: 7, pesoTotalKg: 220 },
    ],
    pesoTotal: 440, qteTotal: 14,
  })),
}));
import { POST } from "@/app/api/producao/pecas/importar-le/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findUnique.mockResolvedValue(null);
  mockPrisma.oP.findMany.mockResolvedValue([{ id: "op89", numero: "089" }]);
  mockPrisma.pecaConjunto.findMany.mockImplementation(async ({ where }) =>
    where.fonte === "LE_IMPORT"
      ? [{ marca: "T89C2", pesoTotalKg: 75 }, { marca: "T89C9", pesoTotalKg: 12 }] // retrato da LE anterior
      : [{ id: "id-c2", marca: "T89C2" }]); // linhas da OP (qualquer fonte)
  mockPrisma.pecaConjunto.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.pecaConjunto.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.pecaConjunto.update.mockResolvedValue({});
  mockPrisma.pecaConjunto.create.mockImplementation(async ({ data }) => {
    if (data.marca === "T89C3") throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
    return { id: "novo-" + data.marca, ...data };
  });
  mockPrisma.pecaConjunto.aggregate.mockResolvedValue({ _sum: { pesoTotalKg: 180.456 } });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

const pedir = (body) => POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }));

function gravacoes() {
  const p = mockPrisma.pecaConjunto;
  return {
    update: p.update.mock.calls, create: p.create.mock.calls,
    updateMany: p.updateMany.mock.calls, deleteMany: p.deleteMany.mock.calls,
    audit: mockPrisma.auditLog.create.mock.calls,
  };
}

describe("rota importar-le (caracterização)", () => {
  it("modo complementar: resposta e gravações", async () => {
    const r = await pedir({ rows: [["x"]] });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchSnapshot();
    expect(gravacoes()).toMatchSnapshot();
  });

  it("modo sobrescrever: resposta e gravações", async () => {
    const r = await pedir({ rows: [["x"]], opNumero: "89", sobrescrever: true });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchSnapshot();
    expect(gravacoes()).toMatchSnapshot();
  });
});

describe("importarLeRows (a lib extraída)", () => {
  it("devolve exatamente o que a rota devolve, com o userId de quem pediu no AuditLog", async () => {
    const daRota = await (await pedir({ rows: [["x"]], sobrescrever: true })).json();
    const gravRota = gravacoes();
    vi.clearAllMocks();
    const { importarLeRows } = await import("@/lib/importar-le-core"); // dinâmico: o snapshot da rota nasceu antes da lib
    const daLib = await importarLeRows([["x"]], { sobrescrever: true, userId: "u1" });
    // a rota passa pelo JSON (campo undefined some); a lib devolve o objeto cru
    expect(JSON.parse(JSON.stringify(daLib))).toEqual(daRota);
    expect(gravacoes()).toEqual(gravRota);
  });
});
