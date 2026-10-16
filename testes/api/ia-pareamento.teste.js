// Ligar um PC à conta: o app pede um código, o projetista vincula no portal, o ADMIN aprova (Vitor, 16/10/2026: "só
// ADMIN"), e o app recebe o token UMA vez. No banco só ficam hashes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
const sessao = vi.hoisted(() => ({ role: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: sessao.role, requireAdminDoPortal: sessao.admin }));
import { POST as INICIAR } from "@/app/api/engenharia-ia/aparelho/iniciar/route";
import { POST as STATUS } from "@/app/api/engenharia-ia/aparelho/status/route";
import { POST as VINCULAR } from "@/app/api/engenharia-ia/aparelho/vincular/route";
import { POST as ACAO } from "@/app/api/admin/engenharia-ia/aparelho/[id]/route";
import { PUT as LIMITE } from "@/app/api/admin/engenharia-ia/limite/route";
import { hashToken } from "@/lib/ia-engenharia";

const post = (rota, body, params) => rota(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), params);
const put = (rota, body) => rota(new Request("http://localhost", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  sessao.role.mockResolvedValue({ id: "u1", name: "John" });
  sessao.admin.mockResolvedValue({ id: "adm", name: "Vitor" });
  mockPrisma.iaAparelho.count.mockResolvedValue(0);
  mockPrisma.iaAparelho.create.mockImplementation(async ({ data }) => ({ id: "ap1", ...data }));
  mockPrisma.iaAparelho.update.mockResolvedValue({});
  mockPrisma.iaAparelho.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.iaLimite.upsert.mockResolvedValue({});
  mockPrisma.iaLimite.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", ativo: true });
});

describe("iniciar (público, chamado pelo app)", () => {
  it("devolve o código curto e o segredo de espera — no banco só o hash da espera", async () => {
    const j = await (await post(INICIAR, { nome: "PC-JOHN" })).json();
    expect(j.codigo).toMatch(/^TRG-[A-Z0-9]{4}$/);
    expect(j.espera.length).toBeGreaterThanOrEqual(40);
    const d = mockPrisma.iaAparelho.create.mock.calls[0][0].data;
    expect(d).toMatchObject({ nome: "PC-JOHN", status: "PAREANDO", codigo: j.codigo, esperaHash: hashToken(j.espera) });
    expect(JSON.stringify(d)).not.toContain(j.espera);
    expect(d.codigoExpiraEm.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
  });
  it("nome inválido: 400; enxurrada de pedidos na última hora: 429", async () => {
    expect((await post(INICIAR, { nome: "" })).status).toBe(400);
    mockPrisma.iaAparelho.count.mockResolvedValueOnce(50);
    expect((await post(INICIAR, { nome: "PC" })).status).toBe(429);
  });
});

describe("vincular (projetista logado no portal)", () => {
  it("prende o código ao usuário e deixa aguardando o ADMIN", async () => {
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce({ id: "ap1", nome: "PC-JOHN", status: "PAREANDO", codigoExpiraEm: new Date(Date.now() + 60_000) });
    const r = await post(VINCULAR, { codigo: "trg-4f7k" });
    expect(r.status).toBe(200);
    expect(mockPrisma.iaAparelho.findUnique.mock.calls[0][0]).toEqual({ where: { codigo: "TRG-4F7K" } });
    expect(mockPrisma.iaAparelho.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "ap1", status: "PAREANDO" }, data: { userId: "u1", status: "AGUARDANDO_ADMIN", codigo: null } });
  });
  it("código expirado, inexistente ou já usado: 404 com a mesma mensagem (não revela qual)", async () => {
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce({ id: "ap1", status: "PAREANDO", codigoExpiraEm: new Date(Date.now() - 1) });
    const a = await post(VINCULAR, { codigo: "TRG-4F7K" });
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce(null);
    const b = await post(VINCULAR, { codigo: "TRG-4F7K" });
    expect([a.status, b.status]).toEqual([404, 404]);
    expect((await a.json()).error).toBe((await b.json()).error);
  });
  it("sem o módulo ENGENHARIA: 403", async () => {
    sessao.role.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await post(VINCULAR, { codigo: "TRG-4F7K" })).status).toBe(403);
  });
});

describe("aprovar e revogar (só o ADMIN do portal)", () => {
  it("aprovar só sai de AGUARDANDO_ADMIN, e grava no AuditLog", async () => {
    const r = await post(ACAO, { acao: "aprovar" }, { params: { id: "ap1" } });
    expect(r.status).toBe(200);
    expect(mockPrisma.iaAparelho.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "ap1", status: "AGUARDANDO_ADMIN" }, data: { status: "APROVADO", aprovadoPorId: "adm" } });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "IA_APARELHO_APROVAR", entity: "IaAparelho", entityId: "ap1" });
  });
  it("revogar vale para aprovado ou ativo e é imediato (o portão só aceita ATIVO)", async () => {
    await post(ACAO, { acao: "revogar" }, { params: { id: "ap1" } });
    expect(mockPrisma.iaAparelho.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "ap1", status: { in: ["APROVADO", "ATIVO", "AGUARDANDO_ADMIN"] } }, data: { status: "REVOGADO", revogadoPorId: "adm" } });
  });
  it("estado que não permite a ação: 409", async () => {
    mockPrisma.iaAparelho.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await post(ACAO, { acao: "aprovar" }, { params: { id: "ap1" } })).status).toBe(409);
  });
  it("quem não é ADMIN do portal: 403", async () => {
    sessao.admin.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await post(ACAO, { acao: "aprovar" }, { params: { id: "ap1" } })).status).toBe(403);
  });
});

describe("status (público, consultado pelo app com o segredo de espera)", () => {
  it("aprovado: entrega o token UMA vez — grava só o hash e passa a ATIVO", async () => {
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce({ id: "ap1", status: "APROVADO", tokenHash: null });
    const j = await (await post(STATUS, { espera: "segredo-de-espera-com-tamanho-suficiente-123" })).json();
    expect(j.status).toBe("ATIVO");
    expect(j.token.length).toBeGreaterThanOrEqual(40);
    const u = mockPrisma.iaAparelho.updateMany.mock.calls[0][0];
    expect(u.where).toEqual({ id: "ap1", status: "APROVADO", tokenHash: null });
    expect(u.data).toEqual({ status: "ATIVO", tokenHash: hashToken(j.token) });
  });
  it("duas consultas ao mesmo tempo: só a que gravou primeiro leva o token", async () => {
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce({ id: "ap1", status: "APROVADO", tokenHash: null });
    mockPrisma.iaAparelho.updateMany.mockResolvedValueOnce({ count: 0 });
    const j = await (await post(STATUS, { espera: "segredo-de-espera-com-tamanho-suficiente-123" })).json();
    expect(j.token).toBeUndefined();
  });
  it("ainda pareando dentro do prazo, ou já expirado", async () => {
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce({ id: "ap1", status: "PAREANDO", codigoExpiraEm: new Date(Date.now() + 60_000) });
    expect((await (await post(STATUS, { espera: "segredo-de-espera-com-tamanho-suficiente-123" })).json()).status).toBe("PAREANDO");
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce({ id: "ap1", status: "PAREANDO", codigoExpiraEm: new Date(Date.now() - 1) });
    expect((await (await post(STATUS, { espera: "segredo-de-espera-com-tamanho-suficiente-123" })).json()).status).toBe("EXPIRADO");
  });
  it("segredo errado: 404, e o token nunca reaparece depois de entregue", async () => {
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce(null);
    expect((await post(STATUS, { espera: "segredo-de-espera-com-tamanho-suficiente-123" })).status).toBe(404);
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce({ id: "ap1", status: "ATIVO", tokenHash: "x" });
    expect((await (await post(STATUS, { espera: "segredo-de-espera-com-tamanho-suficiente-123" })).json())).toEqual({ status: "ATIVO" });
  });
});

describe("teto mensal (ADMIN)", () => {
  it("define em R$, grava no AuditLog; null tira o acesso", async () => {
    expect((await put(LIMITE, { userId: "u1", tetoMensalBrl: 500 })).status).toBe(200);
    expect(mockPrisma.iaLimite.upsert.mock.calls[0][0]).toMatchObject({ where: { userId: "u1" }, create: { userId: "u1", tetoMensalBrl: 500 } });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "IA_LIMITE_DEFINIR", entityId: "u1" });
    await put(LIMITE, { userId: "u1", tetoMensalBrl: null });
    expect(mockPrisma.iaLimite.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
  it("valor negativo ou absurdo: 400", async () => {
    expect((await put(LIMITE, { userId: "u1", tetoMensalBrl: -1 })).status).toBe(400);
    expect((await put(LIMITE, { userId: "u1", tetoMensalBrl: 1e9 })).status).toBe(400);
  });
});

describe("listagem da tela de Admin", () => {
  it("projetistas da Engenharia com teto e gasto do mês; aparelhos e usos com os nomes", async () => {
    const { GET } = await import("@/app/api/admin/engenharia-ia/route");
    mockPrisma.iaAparelho.findMany.mockResolvedValue([{ id: "ap1", nome: "PC-JOHN", userId: "u1", status: "AGUARDANDO_ADMIN" }]);
    mockPrisma.userModulo.findMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
    mockPrisma.iaLimite.findMany.mockResolvedValue([{ userId: "u1", tetoMensalBrl: 500 }]);
    mockPrisma.iaUso.groupBy.mockResolvedValue([{ userId: "u1", _sum: { custoBrl: 123.4, custoUsd: 22 }, _count: { _all: 7 } }]);
    mockPrisma.iaUso.findMany.mockResolvedValue([{ id: "x", userId: "u1", aparelhoId: "ap1", pedido: "liste" }]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1", name: "John", ativo: true }, { id: "u2", name: "Ana", ativo: true }]);
    const j = await (await GET()).json();
    expect(j.projetistas).toEqual([
      { id: "u1", nome: "John", ativo: true, tetoMensalBrl: 500, gastoMesBrl: 123.4, chamadasMes: 7 },
      { id: "u2", nome: "Ana", ativo: true, tetoMensalBrl: null, gastoMesBrl: 0, chamadasMes: 0 },
    ]);
    expect(j.aparelhos[0].usuario).toBe("John");
    expect(j.usos[0]).toMatchObject({ usuario: "John", aparelho: "PC-JOHN", pedido: "liste" });
    expect(mockPrisma.iaAparelho.findMany.mock.calls[0][0].where).toEqual({ status: { not: "PAREANDO" } });
  });
  it("quem não é ADMIN do portal: 403", async () => {
    const { GET } = await import("@/app/api/admin/engenharia-ia/route");
    sessao.admin.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await GET()).status).toBe(403);
  });
});
