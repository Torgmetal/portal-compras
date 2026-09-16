import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// ⚠⚠ Matheus (16/09/2026) quer controlar, depois que o pedido vai pro Omie, se o material foi
// liberado para coleta / encaminhado para obra / recebido — e comparar com o prazo estimado.
// Estes testes travam a rota que grava esses lançamentos.

const mocks = vi.hoisted(() => ({ role: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { POST, DELETE } from "@/app/api/pedido-omie/[id]/acompanhamento/route";

const params = { params: { id: "ped1" } };
const post = (corpo) => POST(new Request("http://localhost/api/pedido-omie/ped1/acompanhamento", { method: "POST", body: JSON.stringify(corpo) }), params);
const del = (q) => DELETE(new Request(`http://localhost/api/pedido-omie/ped1/acompanhamento?${q}`, { method: "DELETE" }), params);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Ana" });
  mockPrisma.pedidoOmie.findUnique.mockResolvedValue({ id: "ped1", numeroPedido: "1234" });
  mockPrisma.acompanhamentoPedido.create.mockResolvedValue({ id: "a1", etapa: "LIBERADO_COLETA", data: new Date("2026-09-19"), observacao: null, registradoPor: { name: "Ana" } });
  mockPrisma.acompanhamentoPedido.findUnique.mockResolvedValue({ id: "a1", pedidoId: "ped1", etapa: "LIBERADO_COLETA", data: new Date("2026-09-19"), observacao: null });
  mockPrisma.acompanhamentoPedido.delete.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("POST — lançar uma etapa", () => {
  it("grava a etapa com a data digitada e o autor", async () => {
    const r = await post({ etapa: "LIBERADO_COLETA", data: "2026-09-19", observacao: "com a transportadora" });
    expect(r.status).toBe(200);
    const dados = mockPrisma.acompanhamentoPedido.create.mock.calls[0][0].data;
    expect(dados).toMatchObject({ pedidoId: "ped1", etapa: "LIBERADO_COLETA", observacao: "com a transportadora", registradoPorId: "u1" });
    expect(dados.data.toISOString()).toContain("2026-09-19");
  });

  it("⚠ a DATA é a digitada, não o momento do lançamento", async () => {
    // Quem registra na segunda o que chegou na sexta precisa registrar a sexta, senão o prazo
    // medido vira o prazo da digitação.
    await post({ etapa: "MATERIAL_RECEBIDO", data: "2026-09-11" });
    expect(mockPrisma.acompanhamentoPedido.create.mock.calls[0][0].data.data.toISOString()).toContain("2026-09-11");
  });

  it("etapa fora da lista é recusada", async () => {
    const r = await post({ etapa: "INVENTADA", data: "2026-09-19" });
    expect(r.status).toBe(400);
    expect(mockPrisma.acompanhamentoPedido.create).not.toHaveBeenCalled();
  });

  it("data que não é data é recusada, e não vira Invalid Date no banco", async () => {
    const r = await post({ etapa: "LIBERADO_COLETA", data: "amanhã" });
    expect(r.status).toBe(400);
    expect(mockPrisma.acompanhamentoPedido.create).not.toHaveBeenCalled();
  });

  it("pedido inexistente devolve 404", async () => {
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue(null);
    expect((await post({ etapa: "LIBERADO_COLETA", data: "2026-09-19" })).status).toBe(404);
  });

  it("observação vazia vira null, não string em branco", async () => {
    await post({ etapa: "LIBERADO_COLETA", data: "2026-09-19", observacao: "   " });
    expect(mockPrisma.acompanhamentoPedido.create.mock.calls[0][0].data.observacao).toBe(null);
  });

  it("sem sessão é 401; sem permissão, 403", async () => {
    mocks.role.mockRejectedValue(new Error("Unauthorized"));
    expect((await post({ etapa: "LIBERADO_COLETA", data: "2026-09-19" })).status).toBe(401);
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    expect((await post({ etapa: "LIBERADO_COLETA", data: "2026-09-19" })).status).toBe(403);
  });

  it("registra no AuditLog", async () => {
    await post({ etapa: "ENCAMINHADO_OBRA", data: "2026-09-19" });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "ACOMPANHAMENTO_PEDIDO_LANCADO", entity: "PedidoOmie", entityId: "ped1",
    });
  });
});

describe("DELETE — desfazer um lançamento errado", () => {
  it("apaga e guarda no AuditLog o que foi apagado", async () => {
    const r = await del("lancamentoId=a1");
    expect(r.status).toBe(200);
    expect(mockPrisma.acompanhamentoPedido.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    // ⚠ Desfazer é a ação cujo rastro some junto com o dado — por isso o diff leva o conteúdo.
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.diff).toMatchObject({ etapa: "LIBERADO_COLETA" });
  });

  it("⚠⚠ lançamento de OUTRO pedido não é apagado por este endereço", async () => {
    mockPrisma.acompanhamentoPedido.findUnique.mockResolvedValue({ id: "a9", pedidoId: "ped-outro", etapa: "MATERIAL_RECEBIDO" });
    const r = await del("lancamentoId=a9");
    expect(r.status).toBe(404);
    expect(mockPrisma.acompanhamentoPedido.delete).not.toHaveBeenCalled();
  });

  it("sem o id do lançamento é 400, não um delete sem alvo", async () => {
    const r = await del("");
    expect(r.status).toBe(400);
    expect(mockPrisma.acompanhamentoPedido.delete).not.toHaveBeenCalled();
  });
});
