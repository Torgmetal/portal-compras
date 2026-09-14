// LE: a chave é o número da OP cadastrada ("089", não "89") e o rodapé "TOTAL.:" não vira peça.
// OP-089 (14/09/2026): duas LEs (R01 sob "089", R02 sob "89"), a antiga com a linha TOTAL de 8.705 peças.
import { beforeEach, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1", name: "Vitor" })) }));
vi.mock("@/lib/parse-le-form21", () => ({ parseFormularioLE: vi.fn(() => ({ opNumero: "89", obra: "BRACELL", pecas: [{ marca: "T89C1", qte: 2, pesoTotalKg: 100 }, { marca: "TOTAL.:", qte: 8705, pesoTotalKg: 22000 }], pesoTotal: 22100, qteTotal: 8707 })) }));
import { POST } from "@/app/api/producao/pecas/importar-le/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findUnique.mockResolvedValue(null);
  mockPrisma.oP.findMany.mockResolvedValue([{ id: "op89", numero: "089" }]);
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([]);
  mockPrisma.pecaConjunto.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.pecaConjunto.create.mockImplementation(async ({ data }) => ({ id: "n", ...data }));
  mockPrisma.pecaConjunto.aggregate.mockResolvedValue({ _sum: { pesoTotalKg: 100 } });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("grava sob a chave da OP cadastrada e deixa o rodapé TOTAL de fora", async () => {
  const r = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ rows: [["x"]] }) }));
  expect(r.status).toBeLessThan(400);
  const gravadas = mockPrisma.pecaConjunto.create.mock.calls.map(([x]) => x.data);
  expect(gravadas.map((d) => d.marca)).toEqual(["T89C1"]);
  expect(gravadas.every((d) => d.opNumero === "089")).toBe(true);
});
