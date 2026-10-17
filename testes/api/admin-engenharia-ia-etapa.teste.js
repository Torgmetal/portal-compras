// /api/admin/engenharia-ia devolve o custo do mês por etapa (e por usuário) — só para o ADMIN do portal.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireAdminDoPortal: vi.fn() }));
import { GET } from "@/app/api/admin/engenharia-ia/route";
import { requireAdminDoPortal } from "@/lib/session";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.iaAparelho.findMany.mockResolvedValue([]);
  mockPrisma.userModulo.findMany.mockResolvedValue([]);
  mockPrisma.iaLimite.findMany.mockResolvedValue([]);
  mockPrisma.iaUso.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([{ id: "u1", name: "John", email: "j@x", ativo: true }]);
  mockPrisma.iaUso.groupBy.mockImplementation(async ({ by }) => (by.includes("conversa")
    ? [{ etapa: "2", userId: "u1", conversa: "c-12345678", _count: { _all: 3 }, _sum: { custoBrl: 4, cacheReadTokens: 10, cacheWriteTokens: 5 } },
       { etapa: null, userId: "u1", conversa: null, _count: { _all: 1 }, _sum: { custoBrl: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }]
    : []));
});

describe("GET /api/admin/engenharia-ia — porEtapa", () => {
  it("agrupa o mês por etapa, com 'sem etapa' para o que não trouxe cabeçalho", async () => {
    const d = await (await GET()).json();
    expect(d.porEtapa.map((e) => e.etapa)).toEqual(["2", "sem etapa"]);
    expect(d.porEtapa[0]).toMatchObject({ chamadas: 3, conversas: 1, custoBrl: 4, cacheGravado: 5, cacheLido: 10 });
    expect(d.porEtapa[0].usuarios[0]).toMatchObject({ usuario: "John", custoBrl: 4 });
  });
  it("quem não é ADMIN do portal não vê custo", async () => {
    requireAdminDoPortal.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await GET()).status).toBe(403);
  });
});
