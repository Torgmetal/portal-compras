import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// Achado do Codex (02/10/2026, rodada 2): o lançamento manual lia PENDENTE, esperava o Omie, e
// gravava RECEBIDA por cima de uma cotação que o encerramento já tinha fechado e avisado. A gravação
// da cotação é condicionada ao status no instante dela; perdeu a corrida, a transação desfaz os itens.

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1", name: "Comprador" })) }));
vi.mock("@/lib/omie-pedido-compra", () => ({ resolverFornecedorPorCnpj: vi.fn(async () => ({})) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { POST as lancar } from "@/app/api/cotacao/[id]/lancar-manual/route";

const req = (body) => new Request("http://localhost/api/cotacao/cot1/lancar-manual", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const CORPO = { cnpj: "45.987.062/0001-77", itens: [{ rmItemId: "ri1", precoUnit: 6.41, qtdCotada: 10, icmsPct: 12, ipiPct: 0 }] };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cotacao.findUnique.mockResolvedValue({ id: "cot1", status: "PENDENTE", nCodOmie: "1", fornecedorNome: "GERDAU", numeroRevisao: 0, itens: [{ id: "ci1", rmItemId: "ri1" }] });
  mockPrisma.rMItem.findMany.mockResolvedValue([{ id: "ri1", unidade: "KG", peso: 10 }]);
  mockPrisma.cotacaoItem.update.mockResolvedValue({});
  mockPrisma.rMItem.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.cotacaoItem.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("lançamento manual × encerramento", () => {
  it("⚠⚠ encerrada entre a leitura e a gravação: 409, e a transação não segue (status condicionado)", async () => {
    mockPrisma.cotacao.updateMany.mockResolvedValue({ count: 0 }); // o encerramento venceu
    const r = await lancar(req(CORPO), { params: { id: "cot1" } });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/encerrada/i);
    expect(mockPrisma.cotacao.update).not.toHaveBeenCalled();
    expect(mockPrisma.cotacao.updateMany.mock.calls[0][0].where).toMatchObject({ id: "cot1", status: { notIn: ["CANCELADA", "ENCERRADA"] } });
    // nada depois da cotação: nem item da RM marcado COTADO
    expect(mockPrisma.rMItem.updateMany).not.toHaveBeenCalled();
  });

  it("sem corrida, grava normalmente", async () => {
    mockPrisma.cotacao.updateMany.mockResolvedValue({ count: 1 });
    const r = await lancar(req(CORPO), { params: { id: "cot1" } });
    expect(r.status).toBe(200);
    expect(mockPrisma.cotacao.updateMany.mock.calls[0][0].data).toMatchObject({ status: "RECEBIDA" });
  });
});
