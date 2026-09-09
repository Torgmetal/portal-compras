import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { GET, PATCH } from "@/app/api/notificacoes/route";

const patch = (corpo) => PATCH(new Request("http://localhost/api/notificacoes",
  { method: "PATCH", body: JSON.stringify(corpo) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "eu" });
  mockPrisma.notificacaoDestinatario.findMany.mockResolvedValue([]);
  mockPrisma.notificacaoDestinatario.count.mockResolvedValue(0);
});

describe("GET — as MINHAS notificações", () => {
  it("filtra por userId da sessão, não por quem foi passado em lugar nenhum", async () => {
    await GET();
    expect(mockPrisma.notificacaoDestinatario.findMany.mock.calls[0][0].where).toEqual({ userId: "eu" });
  });

  it("devolve título, mensagem, link e lida, achatando a notificação embutida", async () => {
    mockPrisma.notificacaoDestinatario.findMany.mockResolvedValue([{
      id: "d1", lida: false, criadoEm: new Date("2026-09-01"),
      notificacao: { id: "n1", tipo: "RM_CRIADA", titulo: "Nova RM", mensagem: "x", link: "/compras/rm/1", createdAt: new Date("2026-09-01") },
    }]);
    mockPrisma.notificacaoDestinatario.count.mockResolvedValue(1);
    const j = await (await GET()).json();
    expect(j.naoLidas).toBe(1);
    expect(j.itens[0]).toMatchObject({ id: "d1", lida: false, titulo: "Nova RM", link: "/compras/rm/1" });
  });

  it("sessão inválida devolve 401", async () => {
    mocks.user.mockRejectedValue(new Error("Unauthorized"));
    expect((await GET()).status).toBe(401);
  });
});

describe("PATCH — marcar como lida", () => {
  it("marca só os ids informados, sempre escopado ao meu userId", async () => {
    const r = await patch({ ids: ["d1", "d2"] });
    expect(r.status).toBe(200);
    expect(mockPrisma.notificacaoDestinatario.updateMany).toHaveBeenCalledWith({
      where: { userId: "eu", id: { in: ["d1", "d2"] } },
      data: expect.objectContaining({ lida: true }),
    });
  });

  // ⚠⚠ O id sozinho não basta — sem o userId no where, o id de uma notificação de OUTRA
  // pessoa seria marcado como lido por aqui.
  it("o where sempre inclui o userId, nunca só o id", async () => {
    await patch({ ids: ["id-de-outra-pessoa"] });
    const { where } = mockPrisma.notificacaoDestinatario.updateMany.mock.calls[0][0];
    expect(where.userId).toBe("eu");
  });

  it("todas:true marca todas as não lidas da pessoa, sem precisar dos ids", async () => {
    await patch({ todas: true });
    expect(mockPrisma.notificacaoDestinatario.updateMany).toHaveBeenCalledWith({
      where: { userId: "eu", lida: false },
      data: expect.objectContaining({ lida: true }),
    });
  });

  it("sem ids nem todas:true é recusado com 400", async () => {
    const r = await patch({});
    expect(r.status).toBe(400);
    expect(mockPrisma.notificacaoDestinatario.updateMany).not.toHaveBeenCalled();
  });

  it("devolve o contador atualizado de não lidas", async () => {
    mockPrisma.notificacaoDestinatario.count.mockResolvedValue(3);
    const j = await (await patch({ todas: true })).json();
    expect(j.naoLidas).toBe(3);
  });

  it("sessão inválida devolve 401 e não marca nada", async () => {
    mocks.user.mockRejectedValue(new Error("Unauthorized"));
    expect((await patch({ todas: true })).status).toBe(401);
    expect(mockPrisma.notificacaoDestinatario.updateMany).not.toHaveBeenCalled();
  });
});
