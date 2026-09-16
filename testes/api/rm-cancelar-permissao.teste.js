import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// ⚠⚠ Matheus (16/09/2026): "preciso dar permissão para o usuário compras@torg.com.br de conseguir
// excluir/cancelar RMs criadas". Antes disto, cancelar exigia tipo ADMIN — e promover a conta a
// ADMIN entregaria junto gestão de usuários, troca de senha e verba.
//
// A permissão virou `User.podeCancelarRM`, por PESSOA, no padrão do `podeAlterarVerba`. Estes
// testes travam os três limites que fazem essa escolha valer a pena:
//   1. quem tem a flag cancela;
//   2. quem não tem continua recebendo 403 (a permissão não vazou para o módulo COMPRAS, que
//      alcançaria fabrine@, engenharia4@ e guilherme@ sem terem sido pedidos);
//   3. forçar sobre RM que JÁ gerou pedido no Omie continua exclusivo do ADMIN — esse estrago
//      não mora no portal, o pedido segue vivo no ERP.

const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mocks.user, requireRole: mocks.user }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { POST } from "@/app/api/rm/[id]/encerrar/route";

const params = { params: { id: "rm1" } };
const req = (corpo) => new Request("http://localhost/api/rm/rm1/encerrar", { method: "POST", body: JSON.stringify(corpo) });
const RM = { id: "rm1", numero: "RI-0042", status: "ABERTA", observacao: null, itens: [{ id: "i1", status: "PENDENTE" }] };

const COMPRAS = { id: "u-compras", tipo: "USUARIO", modulos: ["COMPRAS"], podeCancelarRM: true };
const SEM_PERMISSAO = { id: "u-john", tipo: "USUARIO", modulos: ["COMPRAS", "ENGENHARIA"], podeCancelarRM: false };
const ADMIN = { id: "u-vitor", tipo: "ADMIN", modulos: [], podeCancelarRM: false };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.rM.findUnique.mockResolvedValue(RM);
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
  mockPrisma.rMItem.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.rM.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("cancelar RM — quem pode", () => {
  it("conta com podeCancelarRM cancela, mesmo sem ser ADMIN", async () => {
    mocks.user.mockResolvedValue(COMPRAS);
    const r = await POST(req({ motivo: "RM duplicada" }), params);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, itensCancelados: 1 });
    expect(mockPrisma.rM.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELADA" }) }));
  });

  it("⚠ ter o módulo COMPRAS NÃO basta — a permissão é por pessoa", async () => {
    mocks.user.mockResolvedValue(SEM_PERMISSAO);
    const r = await POST(req({ motivo: "RM duplicada" }), params);
    expect(r.status).toBe(403);
    expect(mockPrisma.rM.update).not.toHaveBeenCalled();
  });

  it("ADMIN continua cancelando sem precisar da flag", async () => {
    mocks.user.mockResolvedValue(ADMIN);
    const r = await POST(req({ motivo: "erro de lançamento" }), params);
    expect(r.status).toBe(200);
  });

  it("sem sessão é 401, não 403 — problemas diferentes, saídas diferentes", async () => {
    mocks.user.mockRejectedValue(new Error("Unauthorized"));
    const r = await POST(req({ motivo: "x" }), params);
    expect(r.status).toBe(401);
  });

  it("motivo continua obrigatório para quem tem a permissão nova", async () => {
    mocks.user.mockResolvedValue(COMPRAS);
    const r = await POST(req({ motivo: "" }), params);
    expect(r.status).toBe(400);
    expect(mockPrisma.rM.update).not.toHaveBeenCalled();
  });
});

describe("cancelar RM que já gerou pedido no Omie", () => {
  beforeEach(() => mockPrisma.rM.findUnique.mockResolvedValue({ ...RM, status: "PEDIDO_GERADO" }));

  it("avisa antes de forçar, para quem tem a permissão nova", async () => {
    mocks.user.mockResolvedValue(COMPRAS);
    const r = await POST(req({ motivo: "cancelado no Omie" }), params);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ requiresForce: true });
  });

  it("⚠⚠ e FORÇAR continua sendo só do ADMIN — o pedido segue vivo no ERP", async () => {
    mocks.user.mockResolvedValue(COMPRAS);
    const r = await POST(req({ motivo: "cancelado no Omie", force: true }), params);
    expect(r.status).toBe(403);
    expect(mockPrisma.rM.update).not.toHaveBeenCalled();
  });

  it("ADMIN força e a RM é cancelada", async () => {
    mocks.user.mockResolvedValue(ADMIN);
    const r = await POST(req({ motivo: "cancelado no Omie", force: true }), params);
    expect(r.status).toBe(200);
  });
});

describe("a auditoria diz por qual permissão passou", () => {
  it("registra podeCancelarRM quando não foi o ADMIN", async () => {
    mocks.user.mockResolvedValue(COMPRAS);
    await POST(req({ motivo: "RM duplicada" }), params);
    const diff = mockPrisma.auditLog.create.mock.calls[0][0].data.diff;
    expect(diff).toMatchObject({ motivo: "RM duplicada", permissao: "podeCancelarRM", forcado: false });
  });

  it("registra ADMIN quando foi o administrador", async () => {
    mocks.user.mockResolvedValue(ADMIN);
    await POST(req({ motivo: "erro" }), params);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.diff.permissao).toBe("ADMIN");
  });
});

// ⚠⚠ A REGRA MORA NUMA FUNÇÃO SÓ (lib/permissao-rm) porque são duas pontas que precisam
// concordar: a rota RECUSA, a tela MOSTRA o botão. Escritas separadamente divergem no primeiro
// ajuste, e as duas divergências são silenciosas em direções opostas — esconder o botão de quem
// tem a permissão faz a funcionalidade parecer não existir; mostrar para quem não tem entrega um
// 403 na cara de quem clicou.
describe("lib/permissao-rm — a mesma regra que a tela usa", () => {
  it("cancelar: ADMIN ou quem tem a flag", async () => {
    const { podeCancelarRM } = await import("@/lib/permissao-rm");
    expect(podeCancelarRM(ADMIN)).toBe(true);
    expect(podeCancelarRM(COMPRAS)).toBe(true);
    expect(podeCancelarRM(SEM_PERMISSAO)).toBe(false);
    expect(podeCancelarRM(null)).toBe(false);
  });

  it("⚠ excluir continua SÓ do ADMIN — a flag de cancelar não abre a porta do apagar", async () => {
    const { podeExcluirRM } = await import("@/lib/permissao-rm");
    expect(podeExcluirRM(ADMIN)).toBe(true);
    expect(podeExcluirRM(COMPRAS)).toBe(false);
    expect(podeExcluirRM(null)).toBe(false);
  });

  it("⚠ forçar sobre pedido do Omie também é só do ADMIN", async () => {
    const { podeForcarCancelamentoRM } = await import("@/lib/permissao-rm");
    expect(podeForcarCancelamentoRM(ADMIN)).toBe(true);
    expect(podeForcarCancelamentoRM(COMPRAS)).toBe(false);
  });
});
