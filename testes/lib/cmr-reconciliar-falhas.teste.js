import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/cmr-sharepoint", () => ({
  lerLinhasCmr: vi.fn(),
  appendLinhasCmr: vi.fn().mockResolvedValue({ anexadas: 0 }),
}));
vi.mock("@/lib/recebimento-notificacoes", () => ({
  notificarMateriaisRecebidos: vi.fn().mockResolvedValue(undefined),
}));

import { reconciliarCmr } from "@/lib/cmr-reconciliar";
import { lerLinhasCmr } from "@/lib/cmr-sharepoint";

// ─── UMA CRIAÇÃO QUE FALHA NÃO PODE LEVAR A RODADA JUNTO ─────────────────────
//
// ⚠⚠ O DEFEITO QUE ISTO TRAVA (achado do Codex, 22/09/2026): os acumuladores `trocas`, `falhas` e
// `falhasDeCriacao` estavam declarados DEPOIS do laço de criação. O `catch` desse laço chamava
// `falhasDeCriacao.push` na zona morta do `const`, então a PRIMEIRA falha ao criar um R virava
// `ReferenceError` e derrubava tudo o que vinha depois — os outros R, os patches da planilha e o
// envio de volta. O `catch` que existia para não perder UM R perdia todos os outros.
//
// ⚠ Nenhum teste pegava porque nenhum simulava criação que rejeita — e em produção isso é comum:
// basta uma violação de unicidade ou uma queda de conexão no meio de 881 linhas.

const linha = (indiceR, descricao) => ({
  indiceR, descricao, rc: "R", certificado: "", loteCorrida: "", especificacao: "",
  pedidoCompra: "", dataRecebimento: null, nf: "", fornecedor: "", obra: "",
  qtd: null, pesoLitro: null, observacao: "",
});

describe("reconciliarCmr — falha ao criar não derruba a rodada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.documentoQualidade.findMany.mockResolvedValue([]);
    mockPrisma.documentoQualidade.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("o R que falhou é RELATADO e os outros continuam sendo criados", async () => {
    lerLinhasCmr.mockResolvedValue([
      linha("26/0001", "CHAPA A-36 ESPESSURA 4,75MM"),
      linha("26/0002", "PORCA A563 3/8"),
      linha("26/0003", "PERFIL W 200X26,6"),
    ]);
    mockPrisma.documentoQualidade.create.mockImplementation(({ data }) =>
      data.importRef === "26/0002"
        ? Promise.reject(new Error("Unique constraint failed"))
        : Promise.resolve({}));

    const r = await reconciliarCmr(mockPrisma, 2026);

    // ⚠ O 26/0003 vem DEPOIS do que falhou: é ele que prova que o laço não morreu no meio.
    expect(r.importados).toBe(2);
    expect(r.falhas).toEqual([{ indiceR: "26/0002", motivo: "Unique constraint failed" }]);
  });

  it("falha na criação não impede os patches da planilha", async () => {
    // Um R já existe no portal com a descrição vazia; a planilha traz o material.
    mockPrisma.documentoQualidade.findMany.mockResolvedValue([
      { importRef: "26/0009", nome: "", norma: null, opNumero: null, numeroCorrida: null,
        numeroDocumento: null, fornecedor: null, pedidoCompra: null, nfNumero: null,
        dataRecebimento: null, pesoKg: null, quantidade: null, observacao: null },
    ]);
    lerLinhasCmr.mockResolvedValue([
      linha("26/0001", "CHAPA A-36 ESPESSURA 4,75MM"),
      linha("26/0009", "PERFIL W 250x25,3"),
    ]);
    mockPrisma.documentoQualidade.create.mockRejectedValue(new Error("banco fora do ar"));

    const r = await reconciliarCmr(mockPrisma, 2026);

    expect(r.importados).toBe(0);
    expect(r.falhas).toHaveLength(1);
    // ⚠⚠ ESTE É O NÚMERO QUE O ReferenceError ZERAVA: a criação morria e o patch nunca rodava.
    expect(r.completados).toBe(1);
    expect(mockPrisma.documentoQualidade.updateMany).toHaveBeenCalledTimes(1);
  });

  it("sem falha nenhuma, a lista de falhas fica vazia", async () => {
    lerLinhasCmr.mockResolvedValue([linha("26/0001", "CHAPA A-36 ESPESSURA 4,75MM")]);
    mockPrisma.documentoQualidade.create.mockResolvedValue({});

    const r = await reconciliarCmr(mockPrisma, 2026);

    expect(r.importados).toBe(1);
    expect(r.falhas).toEqual([]);
  });
});
