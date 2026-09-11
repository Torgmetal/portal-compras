import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { criarNotificacao } from "@/lib/notificacoes";

// ⚠⚠ O SINO JÁ EXISTIU E MORREU PORQUE NINGUÉM VIA — ver a nota em prisma/schema.prisma no
// model Notificacao. Estes testes travam a parte que faz a diferença desta vez: quem recebe.
// Uma notificação de módulo tem que ir para o módulo certo, ADMIN sempre entra, e ninguém de
// fora vê o que não é dele.

const OP_BASE = {
  tipo: "RM_CRIADA", titulo: "Nova RM T97-001", mensagem: "criou a RM", link: "/compras/rm/1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notificacao.create.mockImplementation(async ({ data }) => ({ id: "n1", ...data }));
});

it("evento repetido reutiliza o aviso e os destinatários sem duplicar", async () => {
  mockPrisma.notificacao.upsert.mockResolvedValue({ id: "n-r" });
  await criarNotificacao({ ...OP_BASE, destinatarios: ["gabriel"], chaveEvento: "CMR_RECEBIDO:261234" });
  expect(mockPrisma.notificacao.create).not.toHaveBeenCalled();
  expect(mockPrisma.notificacao.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { chaveEvento: "CMR_RECEBIDO:261234" }, update: {} }));
  expect(mockPrisma.notificacaoDestinatario.createMany).toHaveBeenCalledWith({ data: [{ notificacaoId: "n-r", userId: "gabriel" }], skipDuplicates: true });
});

describe("criarNotificacao — resolver destinatários", () => {
  it("módulo resolve para os usuários ativos daquele módulo + ADMIN", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    await criarNotificacao({ ...OP_BASE, modulos: ["COMPRAS"] });

    const { where } = mockPrisma.user.findMany.mock.calls[0][0];
    expect(where.ativo).toBe(true);
    expect(where.OR).toEqual([
      { tipo: "ADMIN" },
      { modulos: { some: { modulo: { in: ["COMPRAS"] } } } },
    ]);
    expect(mockPrisma.notificacaoDestinatario.createMany.mock.calls[0][0].data)
      .toEqual(expect.arrayContaining([{ notificacaoId: "n1", userId: "u1" }, { notificacaoId: "n1", userId: "u2" }]));
  });

  it("'destinatarios' explícitos entram mesmo sem módulo", async () => {
    await criarNotificacao({ ...OP_BASE, destinatarios: ["u9"] });
    expect(mockPrisma.notificacaoDestinatario.createMany.mock.calls[0][0].data)
      .toEqual([{ notificacaoId: "n1", userId: "u9" }]);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  // ⚠ destinatário pessoal + módulo ao mesmo tempo não pode duplicar a linha — o
  // @@unique([notificacaoId, userId]) até protegeria, mas o createMany não precisa nem tentar.
  it("destinatário que também está no módulo não duplica", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u9" }, { id: "u2" }]);
    await criarNotificacao({ ...OP_BASE, destinatarios: ["u9"], modulos: ["COMPRAS"] });
    const ids = mockPrisma.notificacaoDestinatario.createMany.mock.calls[0][0].data.map((d) => d.userId);
    expect(ids.sort()).toEqual(["u2", "u9"]);
  });

  it("sem nenhum destinatário resolvido, não cria a notificação nem os destinatários", async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    const r = await criarNotificacao({ ...OP_BASE, modulos: ["COMPRAS"] });
    expect(r).toBeNull();
    expect(mockPrisma.notificacao.create).not.toHaveBeenCalled();
    expect(mockPrisma.notificacaoDestinatario.createMany).not.toHaveBeenCalled();
  });

  it("módulo inválido é recusado antes de tocar no banco", async () => {
    const r = await criarNotificacao({ ...OP_BASE, modulos: ["MODULO_QUE_NAO_EXISTE"] });
    expect(r).toBeNull();
    expect(mockPrisma.notificacao.create).not.toHaveBeenCalled();
  });

  it("nunca lança — falha do banco vira null, best-effort como AuditLog/email", async () => {
    mockPrisma.notificacao.create.mockRejectedValue(new Error("banco fora"));
    await expect(criarNotificacao({ ...OP_BASE, destinatarios: ["u1"] })).resolves.toBeNull();
  });

  it("grava tipo, titulo, mensagem, link, dados e origemUserId na Notificacao", async () => {
    await criarNotificacao({ ...OP_BASE, dados: { rmId: "r1" }, origemUserId: "quem-criou", destinatarios: ["u1"] });
    expect(mockPrisma.notificacao.create.mock.calls[0][0].data).toMatchObject({
      tipo: "RM_CRIADA", titulo: OP_BASE.titulo, mensagem: OP_BASE.mensagem, link: OP_BASE.link,
      dados: { rmId: "r1" }, origemUserId: "quem-criou",
    });
  });
});
