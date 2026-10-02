import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
const encerrar = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/cotacao-encerramento", () => ({ encerrarCotacoesDaRM: encerrar }));
vi.mock("../../lib/cotacao-encerramento", () => ({ encerrarCotacoesDaRM: encerrar }));
const { statusAposFinalizar, reavaliarStatusRM } = await import("@/lib/rm-status");

const it_ = (...st) => st.map((status) => ({ status }));

// ⚠⚠ Caso real (25/09/2026): T105-009-R00 com 4 itens COTADOS e 1 atendido pelo estoque voltou para
// ABERTA quando outro pedido da mesma OP foi gerado. Os 4 já tinham proposta: é "pronta pra pedido".
describe("statusAposFinalizar", () => {
  it("⚠⚠ estoque + restantes todos COTADO → COTADA (pronta pra pedido)", () => {
    expect(statusAposFinalizar(it_("ATENDIDO_ESTOQUE", "COTADO", "COTADO", "COTADO", "COTADO"))).toBe("COTADA");
  });

  it("regra do Vitor: sobrou item sem proposta → ABERTA", () => {
    expect(statusAposFinalizar(it_("PEDIDO_GERADO", "EM_COTACAO"))).toBe("ABERTA");
    expect(statusAposFinalizar(it_("PEDIDO_GERADO", "PENDENTE"))).toBe("ABERTA");
  });

  it("COTADO misturado com item sem proposta → ABERTA (o sem proposta precisa voltar à fila)", () => {
    expect(statusAposFinalizar(it_("ATENDIDO_ESTOQUE", "COTADO", "EM_COTACAO"))).toBe("ABERTA");
  });

  it("status desconhecido entre os restantes não promove", () => {
    expect(statusAposFinalizar(it_("PEDIDO_GERADO", "COTADO", "ESTRANHO"))).toBe("ABERTA");
  });

  it("todos finalizados → PEDIDO_GERADO", () => {
    expect(statusAposFinalizar(it_("PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"))).toBe("PEDIDO_GERADO");
  });

  it("nenhum finalizado ou lista vazia → não mexe", () => {
    expect(statusAposFinalizar(it_("COTADO", "EM_COTACAO"))).toBeNull();
    expect(statusAposFinalizar([])).toBeNull();
  });
});

describe("reavaliarStatusRM", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("⚠⚠ caso T105-009: ABERTA indevida volta para COTADA, condicionado ao status lido", async () => {
    mockPrisma.rMItem.findMany.mockResolvedValue(it_("ATENDIDO_ESTOQUE", "COTADO", "COTADO", "COTADO", "COTADO"));
    mockPrisma.rM.findUnique.mockResolvedValue({ status: "COTADA" });
    // já estava COTADA: nada a gravar
    expect(await reavaliarStatusRM("rm1")).toBeNull();
    expect(mockPrisma.rM.updateMany).not.toHaveBeenCalled();
  });

  it("grava com where no status lido; se outra chamada mudou no meio, não passa por cima", async () => {
    mockPrisma.rMItem.findMany.mockResolvedValue(it_("PEDIDO_GERADO", "EM_COTACAO"));
    mockPrisma.rM.findUnique.mockResolvedValue({ status: "COTADA" });
    mockPrisma.rM.updateMany.mockResolvedValue({ count: 0 });
    expect(await reavaliarStatusRM("rm1")).toBeNull();
    expect(mockPrisma.rM.updateMany).toHaveBeenCalledWith({ where: { id: "rm1", status: "COTADA" }, data: { status: "ABERTA" } });
  });

  it("RM cancelada não é ressuscitada", async () => {
    mockPrisma.rMItem.findMany.mockResolvedValue(it_("PEDIDO_GERADO", "COTADO"));
    mockPrisma.rM.findUnique.mockResolvedValue({ status: "CANCELADA" });
    expect(await reavaliarStatusRM("rm1")).toBeNull();
  });
});

// Matheus (02/10/2026): RM que vira Pedido gerado fecha as cotações sem resposta e avisa o fornecedor.
describe("reavaliarStatusRM — encerra as cotações sem resposta", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("virou PEDIDO_GERADO: chama o encerramento da RM", async () => {
    mockPrisma.rMItem.findMany.mockResolvedValue(it_("PEDIDO_GERADO", "ATENDIDO_ESTOQUE"));
    mockPrisma.rM.findUnique.mockResolvedValue({ status: "COTADA" });
    mockPrisma.rM.updateMany.mockResolvedValue({ count: 1 });
    expect(await reavaliarStatusRM("rm1")).toBe("PEDIDO_GERADO");
    expect(encerrar).toHaveBeenCalledWith(mockPrisma, "rm1");
  });

  it("⚠ voltou para ABERTA (sobrou item): não encerra — o fornecedor ainda pode cotar", async () => {
    mockPrisma.rMItem.findMany.mockResolvedValue(it_("PEDIDO_GERADO", "EM_COTACAO"));
    mockPrisma.rM.findUnique.mockResolvedValue({ status: "COTADA" });
    mockPrisma.rM.updateMany.mockResolvedValue({ count: 1 });
    expect(await reavaliarStatusRM("rm1")).toBe("ABERTA");
    expect(encerrar).not.toHaveBeenCalled();
  });

  it("outra chamada mudou a RM no meio (count 0): não encerra daqui", async () => {
    mockPrisma.rMItem.findMany.mockResolvedValue(it_("PEDIDO_GERADO"));
    mockPrisma.rM.findUnique.mockResolvedValue({ status: "COTADA" });
    mockPrisma.rM.updateMany.mockResolvedValue({ count: 0 });
    expect(await reavaliarStatusRM("rm1")).toBeNull();
    expect(encerrar).not.toHaveBeenCalled();
  });
});
