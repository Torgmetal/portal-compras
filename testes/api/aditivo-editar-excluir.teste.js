// Editar e excluir um aditivo (Matheus, 15/10/2026, OP-105: "não tem a opção de editar e nem a opção
// de excluir"). Editar vale para o divulgado; excluir recusa quando algo depende do aditivo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ role: vi.fn(), salvar: vi.fn(), recalcular: vi.fn(), termos: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/referencias-op", () => ({ salvarReferencias: mocks.salvar, recalcularRefCliente: mocks.recalcular, termosDaOP: mocks.termos }));
import { PATCH, DELETE } from "@/app/api/comercial/aditivo/[id]/route";

const params = { params: { id: "ad4" } };
const patch = (corpo) => PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(corpo) }), params);
const del = () => DELETE(new Request("http://localhost", { method: "DELETE" }), params);

const aditivo = (extra = {}) => ({
  id: "ad4", opId: "op105", numero: 4, status: "RASCUNHO", descricao: "Aditivo - OC nº 234248-2", valor: 19788.11,
  dataInicio: null, dataFimPrevista: null, orcamentoPasta: null, orcamentoRef: null,
  _count: { medicoes: 0, aceites: 0 }, itens: [{ _count: { rmItens: 0, solicitacoesVerba: 0 } }],
  receitas: [{ id: "r1", descricao: "Longarinas", valor: 19788.11 }, { id: "r2", descricao: "Apoios", valor: 10 }],
  referencias: [{ papel: "PEDIDO", codigo: "234248-2" }],
  op: { id: "op105", cliente: "TMSA", clienteId: null },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Matheus" });
  mocks.termos.mockResolvedValue({ termos: null });
  mockPrisma.aditivo.findUnique.mockResolvedValue(aditivo());
  mockPrisma.aditivo.update.mockResolvedValue({});
  mockPrisma.aditivo.delete.mockResolvedValue({});
  mockPrisma.oPReceita.aggregate.mockResolvedValue({ _max: { ordem: 7 } });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

const corpo = {
  descricao: "Aditivo 4 — OC 234248-2 · longarinas TC 42/48/54/60",
  dataInicio: "2026-10-14", dataFimPrevista: "2026-12-11",
  pedido: { codigo: "234248-2", itens: "ETC-00846-36", tags: "" },
  receitas: [{ id: "r1", categoria: "FABRICACAO", descricao: "Longarinas", tipoPreco: "VALOR", valor: 19000 }, { categoria: "FABRICACAO", descricao: "Nova", tipoPreco: "VALOR", valor: 788.11 }],
  valor: 19788.11,
};

describe("PATCH — editar", () => {
  it("regrava OC/TAG no escopo do aditivo, atualiza receita no lugar, cria a nova e apaga a que saiu", async () => {
    const r = await patch(corpo);
    expect(r.status).toBe(200);
    expect(mocks.salvar.mock.calls[0][0]).toMatchObject({ opId: "op105", aditivoId: "ad4", entrada: { pedidos: [{ codigo: "234248-2" }] } });
    expect(mockPrisma.oPReceita.update.mock.calls[0][0]).toMatchObject({ where: { id: "r1" }, data: { valor: 19000 } });
    expect(mockPrisma.oPReceita.createMany.mock.calls[0][0].data[0]).toMatchObject({ opId: "op105", aditivoId: "ad4", descricao: "Nova", ordem: 8, observacao: "aditivo 4" });
    expect(mockPrisma.oPReceita.deleteMany.mock.calls[0][0]).toEqual({ where: { id: { in: ["r2"] }, aditivoId: "ad4" } });
    expect(mockPrisma.aditivo.update.mock.calls[0][0].data).toMatchObject({ descricao: corpo.descricao, valor: 19788.11 });
  });

  it("vale para o DIVULGADO (Vitor) e o histórico guarda antes e depois", async () => {
    mockPrisma.aditivo.findUnique
      .mockResolvedValueOnce(aditivo({ status: "DIVULGADO" }))
      .mockResolvedValueOnce(aditivo({ status: "DIVULGADO", descricao: corpo.descricao })); // a releitura depois de gravar
    const j = await (await patch(corpo)).json();
    expect(j).toMatchObject({ ok: true, divulgado: true });
    const log = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ action: "update_aditivo", entity: "Aditivo", entityId: "ad4" });
    expect(log.diff.antes.descricao).toBe("Aditivo - OC nº 234248-2");
    expect(log.diff.depois.descricao).toBe(corpo.descricao);
  });

  it("sem OC: apaga as referências do aditivo, nunca as do contrato", async () => {
    await patch({ ...corpo, pedido: null });
    expect(mocks.salvar.mock.calls[0][0]).toMatchObject({ aditivoId: "ad4", entrada: { pedidos: [] } });
  });

  it("aditivo inexistente → 404; corpo sem descrição → 400", async () => {
    mockPrisma.aditivo.findUnique.mockResolvedValueOnce(null);
    expect((await patch(corpo)).status).toBe(404);
    expect((await patch({ ...corpo, descricao: "" })).status).toBe(400);
  });
});

describe("DELETE — excluir", () => {
  it("rascunho livre: apaga receitas e OC/TAG dele ANTES (são SetNull e virariam do contrato)", async () => {
    const r = await del();
    expect(r.status).toBe(200);
    expect(mockPrisma.oPReceita.deleteMany).toHaveBeenCalledWith({ where: { aditivoId: "ad4" } });
    expect(mockPrisma.oPReferencia.deleteMany).toHaveBeenCalledWith({ where: { aditivoId: "ad4" } });
    expect(mockPrisma.aditivo.delete).toHaveBeenCalledWith({ where: { id: "ad4" } });
    expect(mocks.recalcular).toHaveBeenCalledWith("op105", mockPrisma);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "delete_aditivo", diff: { numero: 4, receitas: 2 } });
  });

  it("com medição vinculada: 409 dizendo o motivo, e nada é apagado", async () => {
    mockPrisma.aditivo.findUnique.mockResolvedValueOnce(aditivo({ _count: { medicoes: 1, aceites: 0 } }));
    const r = await del();
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/1 medição vinculada/);
    expect(mockPrisma.aditivo.delete).not.toHaveBeenCalled();
    expect(mockPrisma.oPReceita.deleteMany).not.toHaveBeenCalled();
  });

  it("sem permissão → 403", async () => {
    mocks.role.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await del()).status).toBe(403);
  });
});
