import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));

const { buscarRMsDeServico } = await import("@/lib/rms-servico");

// Prova de que a base cobre código que fala com o banco — sem abrir uma
// conexão. O DATABASE_URL do setup aponta pra lugar nenhum de propósito: se
// este mock falhar, o teste quebra na hora em vez de escrever em produção.
describe("buscarRMsDeServico", () => {
  beforeEach(() => {
    mockPrisma.rM.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.rM.groupBy.mockReset().mockResolvedValue([]);
  });

  it("em andamento consulta as três situações ativas", async () => {
    await buscarRMsDeServico("ALUGUEL", false);
    const where = mockPrisma.rM.findMany.mock.calls[0][0].where;
    expect(where.tipoRM).toBe("ALUGUEL");
    expect(where.status.in).toEqual(["ABERTA", "EM_COTACAO", "COTADA"]);
  });

  it("histórico consulta as arquivadas", async () => {
    await buscarRMsDeServico("MONTAGEM", true);
    const where = mockPrisma.rM.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(["PEDIDO_GERADO", "CANCELADA"]);
  });

  it("dobra o groupBy num mapa de contagem por status", async () => {
    mockPrisma.rM.groupBy.mockResolvedValue([
      { status: "ABERTA", _count: { _all: 3 } },
      { status: "PEDIDO_GERADO", _count: { _all: 7 } },
    ]);
    const { statusCount } = await buscarRMsDeServico("ALUGUEL", false);
    expect(statusCount).toEqual({ ABERTA: 3, PEDIDO_GERADO: 7 });
  });
});
