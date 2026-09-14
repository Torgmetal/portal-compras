// Marcar como conjunto: posição de conjunto (croqui de alguém) nunca vira conjunto.
// OP-113 (03/09/2026): 30 chapas viraram "avulsas na montagem" e os conjuntos-pai ficaram "não
// prontos" por onze dias — nenhuma baixa de corte as alcançava mais.
import { beforeEach, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1", name: "Gabriel" })) }));
import { POST } from "@/app/api/producao/pecas/marcar-conjunto/route";

const post = (body) => POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  // P3 e P13 são chapas de conjunto; A200 é avulsa de verdade (não é croqui de ninguém)
  mockPrisma.pecaConjunto.findMany.mockImplementation(async ({ where }) => [{ id: "p3", marca: "T113A-P3" }, { id: "p13", marca: "T113A-P13" }].filter((p) => where.id.in.includes(p.id)));
  mockPrisma.pecaConjunto.updateMany.mockImplementation(async ({ where }) => ({ count: where.id.in.length }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("deixa a posição de conjunto de fora, nomeia e ainda converte a avulsa", async () => {
  const r = await post({ ids: ["p3", "p13", "a200"] });
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(j.atualizados).toBe(1);
  expect(j.ignoradas.map((p) => p.marca)).toEqual(["T113A-P3", "T113A-P13"]);
  expect(j.aviso).toMatch(/posições de conjunto/);
  const upd = mockPrisma.pecaConjunto.updateMany.mock.calls[0][0];
  expect(upd.where.id.in).toEqual(["a200"]);
  expect(upd.data).toMatchObject({ tipoPeca: "CONJUNTO", status: "MONTAGEM" });
});

it("só posições: não escreve nada e não inventa sucesso", async () => {
  const r = await post({ ids: ["p3"] });
  const j = await r.json();
  expect(j.atualizados).toBe(0);
  expect(mockPrisma.pecaConjunto.updateMany).not.toHaveBeenCalled();
});

it("reverter continua livre (volta para croqui pendente)", async () => {
  const r = await post({ ids: ["x1"], reverter: true });
  const j = await r.json();
  expect(j.aviso).toBeNull();
  expect(mockPrisma.pecaConjunto.updateMany.mock.calls[0][0].data).toMatchObject({ tipoPeca: "CROQUI", status: "PENDENTE" });
});
