import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ role: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { DELETE } from "@/app/api/qualidade/rnc/[id]/route";

// ⚠⚠ O INCIDENTE QUE ESTE ARQUIVO GUARDA. A RNC-019/26 foi apagada por engano em 09/09/2026 e o
// `diff` do AuditLog era `{}`: sobraram número, autor e hora. Reconstruí-la em 21/09 exigiu
// decodificar o timestamp escondido no `cuid` do registro apagado e varrer o blob atrás das fotos
// órfãs — e cliente, OP e descrição não voltaram, porque não estavam em lugar nenhum.

const RNC = {
  id: "rnc1", numero: 19, ano: 2026, tipo: "INTERNA", cliente: "TORG",
  opNumero: "T89", descricao: "peça fora de esquadro", planoAcaoId: "pa1",
  fotos: [{ url: "https://blob/x.jpg", legenda: "antes" }],
};

const req = () => new Request("http://localhost/x", { method: "DELETE" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Matheus" });
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
  mockPrisma.naoConformidade.findUnique.mockResolvedValue(RNC);
  mockPrisma.planoAcao.findUnique.mockResolvedValue({ id: "pa1", oQue: "retrabalhar" });
});

describe("excluir RNC", () => {
  it("guarda o registro INTEIRO no diff, não um resumo", async () => {
    const r = await DELETE(req(), { params: { id: "rnc1" } });
    expect(r.status).toBe(200);
    const { diff } = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(diff.registro).toEqual(RNC);
    // ⚠ o plano de ação some junto com a RNC, então tem de ser preservado junto
    expect(diff.planoAcao).toEqual({ id: "pa1", oQue: "retrabalhar" });
    // ⚠ e o número fica solto: é por ele que se procura "quem apagou a 019"
    expect(diff).toMatchObject({ numero: 19, ano: 2026 });
  });

  // ⚠⚠ A REGRA CENTRAL: não conseguir preservar a cópia NÃO pode virar "apaga assim mesmo" — era
  // exatamente esse `.catch(() => {})` que deixava o incidente acontecer de novo.
  it("se a auditoria falhar, a RNC NÃO é apagada", async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error("banco fora"));
    await expect(DELETE(req(), { params: { id: "rnc1" } })).rejects.toThrow();
    expect(mockPrisma.naoConformidade.delete).not.toHaveBeenCalled();
  });

  it("apaga o plano vinculado com deleteMany — plano já apagado não derruba a transação", async () => {
    await DELETE(req(), { params: { id: "rnc1" } });
    expect(mockPrisma.planoAcao.deleteMany).toHaveBeenCalledWith({ where: { id: "pa1" } });
    expect(mockPrisma.planoAcao.delete).not.toHaveBeenCalled();
  });

  it("RNC sem plano de ação não procura plano nenhum", async () => {
    mockPrisma.naoConformidade.findUnique.mockResolvedValue({ ...RNC, planoAcaoId: null });
    await DELETE(req(), { params: { id: "rnc1" } });
    expect(mockPrisma.planoAcao.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.planoAcao.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.diff.planoAcao).toBe(null);
  });

  it("id que não existe é 404, não 500 — e não grava auditoria de nada", async () => {
    mockPrisma.naoConformidade.findUnique.mockResolvedValue(null);
    const r = await DELETE(req(), { params: { id: "sumiu" } });
    expect(r.status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.naoConformidade.delete).not.toHaveBeenCalled();
  });

  it("sem sessão é 401 e sem papel é 403", async () => {
    mocks.role.mockRejectedValue(new Error("Unauthorized"));
    expect((await DELETE(req(), { params: { id: "rnc1" } })).status).toBe(401);
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    expect((await DELETE(req(), { params: { id: "rnc1" } })).status).toBe(403);
    expect(mockPrisma.naoConformidade.delete).not.toHaveBeenCalled();
  });
});
