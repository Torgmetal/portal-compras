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
    mockPrisma.rM.count.mockReset().mockResolvedValue(0);
    mockPrisma.oP.findMany.mockReset().mockResolvedValue([]);
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

// ⚠⚠ O MESMO DEFEITO DAS RMs DE MATERIAL, corrigido aqui antes de sangrar. Lá (16/09/2026) o
// `take: 100` com o filtro por obra rodando no navegador escondeu 111 das 211 RMs e sumiu com 11
// obras do seletor. Aqui os volumes ainda são de 1 RM por tipo — o defeito estava montado e
// esperando o histórico crescer. Matheus: "pode fazer para já deixar certo."
describe("buscarRMsDeServico — a obra escolhida vem inteira", () => {
  beforeEach(() => {
    mockPrisma.rM.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.rM.groupBy.mockReset().mockResolvedValue([]);
    mockPrisma.rM.count.mockReset().mockResolvedValue(0);
    mockPrisma.oP.findMany.mockReset().mockResolvedValue([]);
  });

  const consulta = () => mockPrisma.rM.findMany.mock.calls.at(-1)[0];

  it("⚠⚠ com obra escolhida NÃO existe teto", async () => {
    await buscarRMsDeServico("ALUGUEL", false, "097");
    expect(consulta().take).toBeUndefined();
  });

  it("⚠⚠ o filtro da obra vai para o BANCO, não para o navegador", async () => {
    await buscarRMsDeServico("MONTAGEM", true, "060");
    expect(consulta().where).toMatchObject({ tipoRM: "MONTAGEM", op: { numero: "060" } });
  });

  it("sem obra o teto de 100 continua — o Neon é pequeno", async () => {
    await buscarRMsDeServico("ALUGUEL", false, null);
    expect(consulta().take).toBe(100);
    expect(consulta().where.op).toBeUndefined();
  });

  it("⚠ o total é do MESMO escopo da lista, e é ele que denuncia o corte", async () => {
    mockPrisma.rM.findMany.mockResolvedValue(Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` })));
    mockPrisma.rM.count.mockResolvedValue(137);
    const { total, truncada } = await buscarRMsDeServico("ALUGUEL", true, null);
    expect(total).toBe(137);
    expect(truncada).toBe(true);
  });

  it("lista que cabe inteira não é truncada", async () => {
    mockPrisma.rM.findMany.mockResolvedValue([{ id: "a" }]);
    mockPrisma.rM.count.mockResolvedValue(1);
    expect((await buscarRMsDeServico("MONTAGEM", false, null)).truncada).toBe(false);
  });

  it("⚠ as opções de obra saem de consulta própria, não das linhas carregadas", async () => {
    mockPrisma.rM.groupBy.mockImplementation(async ({ by }) =>
      by[0] === "opId" ? [{ opId: "op1", _count: { _all: 4 } }] : []);
    mockPrisma.oP.findMany.mockResolvedValue([{ id: "op1", numero: "085", cliente: "DANPOWER" }]);
    const { obras } = await buscarRMsDeServico("ALUGUEL", false, null);
    expect(obras).toEqual([{ numero: "085", cliente: "DANPOWER", quantidade: 4 }]);
  });

  it("⚠ o statusCount continua sendo do tipo inteiro, não do escopo da aba", async () => {
    mockPrisma.rM.groupBy.mockImplementation(async ({ by, where }) =>
      by[0] === "status" && where.status === undefined
        ? [{ status: "ABERTA", _count: { _all: 2 } }]
        : []);
    const { statusCount } = await buscarRMsDeServico("ALUGUEL", true, null);
    expect(statusCount).toEqual({ ABERTA: 2 });
  });
});
