import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// Mesma corrida do submeter (Codex, 02/10/2026): a cotação lida como PENDENTE é encerrada antes da
// gravação — "adicionar RM" não pode acrescentar itens a um link que já diz "encerrada".

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/cotacao-estoque", () => ({
  calcularAbatimentoEstoque: vi.fn(async () => ({ porItem: new Map(), abatidos: [], excluidos: [] })),
}));
vi.mock("@/lib/faturamento-direto", () => ({ mapearFDPorRM: vi.fn(async () => new Map()), itemEhFD: () => false }));

import { POST as adicionar } from "@/app/api/cotacao/[id]/adicionar-rm/route";

const req = () => new Request("http://localhost/api/cotacao/cot1/adicionar-rm", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rmIds: ["rm2"] }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cotacao.findUnique.mockResolvedValue({ id: "cot1", status: "PENDENTE", faturamento: "Torg", fornecedorNome: "GERDAU", itens: [], rm: { id: "rm1", numero: "A" } });
  mockPrisma.rM.findMany.mockResolvedValue([{ id: "rm2", numero: "B", status: "ABERTA", tipoRM: "MATERIAL", itens: [{ id: "ri9", rmId: "rm2", status: "PENDENTE", qtd: 1, peso: 0 }] }]);
  mockPrisma.cotacaoItem.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.rMItem.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("adicionar RM × encerramento", () => {
  it("⚠ encerrada no meio: 409 e nenhum item criado", async () => {
    mockPrisma.cotacao.updateMany.mockResolvedValue({ count: 0 });
    const r = await adicionar(req(), { params: { id: "cot1" } });
    expect(r.status).toBe(409);
    expect(mockPrisma.cotacaoItem.createMany).not.toHaveBeenCalled();
  });

  it("cotação viva: segue e cria os itens", async () => {
    mockPrisma.cotacao.updateMany.mockResolvedValue({ count: 1 });
    const r = await adicionar(req(), { params: { id: "cot1" } });
    expect(r.status).toBe(200);
    expect(mockPrisma.cotacaoItem.createMany).toHaveBeenCalled();
  });
});
