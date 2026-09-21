// A rota que Compras usa para ACEITAR ou RECUSAR a data que o fornecedor propôs.
//
// ⚠⚠ É O ÚNICO LUGAR DO PORTAL QUE TRANSFORMA PROPOSTA EM PRAZO. Tudo aqui é sobre não deixar
// isso acontecer por acidente: sem sessão, sobre proposta que mudou, ou duas vezes.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));

import { POST } from "@/app/api/compras/prazos-rm/prazo-proposto/route";

const req = (corpo) => new Request("http://localhost/api/compras/prazos-rm/prazo-proposto",
  { method: "POST", body: JSON.stringify(corpo) });

const PROPOSTO = new Date("2026-11-20T00:00:00.000Z");

const PEDIDO = {
  id: "p1", numeroPedido: "1977", codigoPedido: "c1", createdAt: new Date("2026-07-01"),
  fornecedorNome: "SOUFER", dataEntregaReal: null,
  prazoEntregaPrevisto: new Date("2026-09-08T12:00:00-03:00"), prazoOriginal: null,
  prazoProposto: PROPOSTO, prazoPropostoEm: new Date("2026-09-18"),
  prazoPropostoMotivo: "atraso na laminação", prazoPropostoId: "prop-1",
  prazoHistorico: [],
  cotacao: { observacao: null, fornecedorEmail: "vendas@soufer.com.br", fornecedor: null, itens: [] },
  rmItens: [{ rm: { numero: "T118-001-R00" } }],
};

const corpo = (o = {}) => ({ pedidoId: "p1", propostaId: "prop-1", acao: "aprovar", ...o });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ id: "u1", name: "Matheus" });
  mocks.sendEmail.mockResolvedValue({ ok: true });
  mockPrisma.pedidoOmie.findUnique.mockResolvedValue(PEDIDO);
  mockPrisma.pedidoOmie.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
  mockPrisma.prazoHistorico.create.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("quem pode decidir", () => {
  it("sem sessão é 401", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Unauthorized"));
    expect((await POST(req(corpo()))).status).toBe(401);
  });

  it("com sessão de outro módulo é 403", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Forbidden"));
    expect((await POST(req(corpo()))).status).toBe(403);
  });
});

describe("⚠⚠ ninguém aprova uma proposta que não leu", () => {
  it("propostaId divergente é 409, e NADA é gravado", async () => {
    const res = await POST(req(corpo({ propostaId: "prop-ANTIGA" })));
    expect(res.status).toBe(409);
    expect(mockPrisma.pedidoOmie.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.prazoHistorico.create).not.toHaveBeenCalled();
  });

  it("pedido sem proposta pendente é 409", async () => {
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue({
      ...PEDIDO, prazoProposto: null, prazoPropostoId: null });
    expect((await POST(req(corpo()))).status).toBe(409);
  });

  // ⚠⚠ A CORRIDA REAL: a tela leu prop-1, o fornecedor mandou prop-2 e o UPDATE condicionado não
  // encontra mais a linha. Sem isso o histórico registraria uma data que ninguém aprovou.
  it("perdendo a corrida DENTRO da transação, é 409", async () => {
    mockPrisma.pedidoOmie.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req(corpo()));
    expect(res.status).toBe(409);
    expect(mockPrisma.prazoHistorico.create).not.toHaveBeenCalled();
  });

  it("a troca é condicionada ao id da proposta no próprio UPDATE", async () => {
    await POST(req(corpo()));
    expect(mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].where)
      .toEqual({ id: "p1", prazoPropostoId: "prop-1", dataEntregaReal: null });
  });

  it("pedido já entregue não aceita aprovação", async () => {
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue({ ...PEDIDO, dataEntregaReal: new Date() });
    expect((await POST(req(corpo()))).status).toBe(400);
  });
});

describe("aprovar", () => {
  it("a data proposta vira prazo e a proposta é apagada", async () => {
    await POST(req(corpo()));
    const data = mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].data;
    expect(+data.prazoEntregaPrevisto).toBe(+PROPOSTO);
    expect(data.prazoProposto).toBeNull();
    expect(data.prazoPropostoId).toBeNull();
  });

  it("guarda o prazo combinado ANTES, uma vez só", async () => {
    await POST(req(corpo()));
    expect(+mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].data.prazoOriginal)
      .toBe(+PEDIDO.prazoEntregaPrevisto);

    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: "u1" });
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue({ ...PEDIDO, prazoOriginal: new Date("2026-08-01") });
    mockPrisma.pedidoOmie.updateMany.mockResolvedValue({ count: 1 });
    await POST(req(corpo()));
    expect(mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].data).not.toHaveProperty("prazoOriginal");
  });

  // ⚠⚠ ACHADO DO CODEX: `prazoEntregaPrevisto` sozinho é nulo em pedido cuja previsão vem dos
  // itens da cotação. Gravando a coluna crua, o `prazoOriginal` nasceria nulo e a cobrança
  // perderia a referência do que tinha sido combinado.
  it("⚠⚠ prazoOriginal vem da previsão EFETIVA, não da coluna crua", async () => {
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue({
      ...PEDIDO,
      prazoEntregaPrevisto: null,
      cotacao: { ...PEDIDO.cotacao, itens: [{ vencedor: true, prazoEntrega: new Date("2026-10-15") }] },
    });
    await POST(req(corpo()));
    expect(+mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].data.prazoOriginal)
      .toBe(+new Date("2026-10-15"));
  });

  // ⚠ O prefixo é por onde a rota pública decide o que devolver ao fornecedor. Um comentário
  // interno de quem aprovou colado aqui vazaria pelo link.
  it("⚠ o histórico leva o prefixo [Fornecedor] e o que ELE escreveu", async () => {
    await POST(req(corpo({ motivo: "aceito, mas é a última vez" })));
    const h = mockPrisma.prazoHistorico.create.mock.calls[0][0].data;
    expect(h.motivo).toBe("[Fornecedor] atraso na laminação");
    expect(h.motivo).not.toMatch(/última vez/);
    expect(h.alteradoPorId).toBe("u1");
  });

  it("registra na auditoria com ação própria", async () => {
    await POST(req(corpo()));
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe("APROVAR_PRAZO_PROPOSTO");
  });

  it("aprovar não manda e-mail para o fornecedor", async () => {
    await POST(req(corpo()));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

describe("recusar", () => {
  const recusa = (o = {}) => corpo({ acao: "recusar", ...o });

  it("apaga a proposta e NÃO mexe no prazo", async () => {
    await POST(req(recusa()));
    const data = mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].data;
    expect(data.prazoProposto).toBeNull();
    expect(data).not.toHaveProperty("prazoEntregaPrevisto");
    expect(mockPrisma.prazoHistorico.create).not.toHaveBeenCalled();
  });

  // ⚠⚠ ACHADO DO CODEX: recusa silenciosa é pior que não ter o fluxo — ele segue achando que a
  // data dele está combinada, e a Torg programa o pátio para outra.
  it("⚠⚠ avisa o fornecedor por e-mail", async () => {
    await POST(req(recusa({ motivo: "a obra não espera" })));
    expect(mocks.sendEmail).toHaveBeenCalled();
    const m = mocks.sendEmail.mock.calls[0][0];
    expect(m.to).toBe("vendas@soufer.com.br");
    expect(m.html).toMatch(/20\/11\/2026/);
    expect(m.html).toMatch(/a obra não espera/);
  });

  it("⚠ o texto pede a data possível, não acusa", async () => {
    await POST(req(recusa()));
    expect(mocks.sendEmail.mock.calls[0][0].text).toMatch(/data mais próxima que conseguem cumprir/);
  });

  // ⚠ A recusa já está gravada: refazer não traria o e-mail de volta. A tela é que precisa saber.
  it("e-mail falhando ainda é sucesso, mas com avisoOk falso", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("Resend fora"));
    const res = await POST(req(recusa()));
    expect(res.status).toBe(200);
    expect((await res.json()).avisoOk).toBe(false);
  });

  it("fornecedor sem e-mail devolve semEmail para a tela avisar", async () => {
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue({
      ...PEDIDO, cotacao: { ...PEDIDO.cotacao, fornecedorEmail: null, fornecedor: null } });
    const res = await POST(req(recusa()));
    expect((await res.json()).semEmail).toBe(true);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("registra na auditoria com ação própria", async () => {
    await POST(req(recusa()));
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe("RECUSAR_PRAZO_PROPOSTO");
  });
});

describe("o corpo", () => {
  it("ação desconhecida é 400", async () => {
    expect((await POST(req(corpo({ acao: "ignorar" })))).status).toBe(400);
  });

  it("sem propostaId é 400 — aprovar 'o que estiver lá' não é uma opção", async () => {
    expect((await POST(req({ pedidoId: "p1", acao: "aprovar" }))).status).toBe(400);
  });

  it("pedido inexistente é 404", async () => {
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue(null);
    expect((await POST(req(corpo()))).status).toBe(404);
  });
});
