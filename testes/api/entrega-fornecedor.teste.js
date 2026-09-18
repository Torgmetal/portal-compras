// A rota PÚBLICA do fornecedor — sem login, aberta pelo token que vai no e-mail de cobrança.
//
// ⚠⚠ É A ÚNICA ESCRITA DO PORTAL QUE UM TERCEIRO FAZ SEM SE IDENTIFICAR. Tudo aqui é sobre o que
// ela NÃO pode fazer.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ avisar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/resposta-fornecedor", () => ({ avisarResposta: mocks.avisar }));

import { PATCH } from "@/app/api/fornecedores/entrega/[token]/route";

const params = { token: "tok-123" };
const req = (corpo) => new Request("http://localhost/api/fornecedores/entrega/tok-123",
  { method: "PATCH", body: JSON.stringify(corpo) });

const PEDIDO = {
  id: "p1", numeroPedido: "1977", fornecedorNome: "SOUFER",
  prazoEntregaPrevisto: new Date("2026-09-08T12:00:00-03:00"), prazoOriginal: null,
  dataEntregaReal: null, encerradoOmieEm: null,
  fornecedorEntregaEm: null, fornecedorNfNumero: null,
  rmItens: [{ rm: { numero: "T118-001-R00" } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.pedidoOmie.findUnique.mockResolvedValue(PEDIDO);
  mockPrisma.pedidoOmie.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
  mockPrisma.prazoHistorico.create.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mocks.avisar.mockResolvedValue({ avisado: true });
});

describe("o corpo tem de escolher UMA resposta", () => {
  it("nova previsão sozinha passa", async () => {
    expect((await PATCH(req({ novoPrazo: "2026-10-01" }), { params })).status).toBe(200);
  });

  it("entrega com NF sozinha passa", async () => {
    expect((await PATCH(req({ entregue: true, nfNumero: "000362322" }), { params })).status).toBe(200);
  });

  // ⚠ Corpo ambíguo seria o servidor escolhendo por ele qual resposta vale.
  it("⚠ os dois juntos são recusados", async () => {
    const res = await PATCH(req({ novoPrazo: "2026-10-01", entregue: true, nfNumero: "1" }), { params });
    expect(res.status).toBe(400);
  });

  it("nenhum dos dois é recusado", async () => {
    expect((await PATCH(req({ motivo: "oi" }), { params })).status).toBe(400);
  });

  it("entregue sem NF é recusado — a nota é o que torna a declaração conferível", async () => {
    expect((await PATCH(req({ entregue: true }), { params })).status).toBe(400);
  });

  it("`entregue: false` não é um jeito de burlar a união", async () => {
    expect((await PATCH(req({ entregue: false, nfNumero: "1" }), { params })).status).toBe(400);
  });
});

// ⚠⚠ UM TERCEIRO SEM LOGIN NÃO MUDA A CRENÇA DO PORTAL SOBRE O QUE CHEGOU. Fizesse isso, o pedido
// sumiria do vermelho e da lista de cobrança sem ninguém da Torg ter conferido nada.
describe("⚠⚠ declarar entrega NÃO é entregar", () => {
  it("⚠⚠ grava em colunas próprias, nunca em dataEntregaReal/statusEntrega/nfNumero", async () => {
    await PATCH(req({ entregue: true, nfNumero: "000362322" }), { params });
    const data = mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].data;
    expect(data).toEqual({ fornecedorEntregaEm: expect.any(Date), fornecedorNfNumero: "000362322" });
    expect(data).not.toHaveProperty("dataEntregaReal");
    expect(data).not.toHaveProperty("statusEntrega");
    expect(data).not.toHaveProperty("nfNumero");
  });

  it("registra a declaração na auditoria com ação própria", async () => {
    await PATCH(req({ entregue: true, nfNumero: "123" }), { params });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "FORNECEDOR_DECLAROU_ENTREGA", userId: null }),
    }));
  });

  it("avisa Compras de que ele informou entrega, com a NF", async () => {
    await PATCH(req({ entregue: true, nfNumero: "000362322" }), { params });
    expect(mocks.avisar).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ id: "p1", rmNumero: "T118-001-R00" }),
      expect.objectContaining({ entregue: true, nfNumero: "000362322" }));
  });
});

describe("a NF que ele digita", () => {
  it("preserva zero à esquerda — é o número da nota, não um inteiro", async () => {
    await PATCH(req({ entregue: true, nfNumero: "000362322" }), { params });
    expect(mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].data.fornecedorNfNumero).toBe("000362322");
  });

  it("apara espaço em volta", async () => {
    await PATCH(req({ entregue: true, nfNumero: "  123  " }), { params });
    expect(mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].data.fornecedorNfNumero).toBe("123");
  });

  it("recusa quebra de linha e caractere de controle", async () => {
    expect((await PATCH(req({ entregue: true, nfNumero: "12\n34" }), { params })).status).toBe(400);
  });

  it("recusa número absurdamente longo", async () => {
    expect((await PATCH(req({ entregue: true, nfNumero: "9".repeat(41) }), { params })).status).toBe(400);
  });
});

// ⚠⚠ Sem isto, recarregar a página e reenviar viraria outro aviso — e a rota é pública.
describe("⚠⚠ repetição idêntica é sucesso SEM evento", () => {
  it("⚠⚠ a mesma declaração de novo não avisa ninguém", async () => {
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue({
      ...PEDIDO, fornecedorEntregaEm: new Date(), fornecedorNfNumero: "123" });
    const res = await PATCH(req({ entregue: true, nfNumero: "123" }), { params });
    expect(res.status).toBe(200);
    expect(mocks.avisar).not.toHaveBeenCalled();
    expect(mockPrisma.pedidoOmie.updateMany).not.toHaveBeenCalled();
  });

  it("⚠⚠ a mesma data de novo não avisa ninguém", async () => {
    const res = await PATCH(req({ novoPrazo: "2026-09-08T15:00:00.000Z" }), { params });
    expect(res.status).toBe(200);
    expect(mocks.avisar).not.toHaveBeenCalled();
  });

  it("NF diferente é resposta nova e avisa", async () => {
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue({
      ...PEDIDO, fornecedorEntregaEm: new Date(), fornecedorNfNumero: "123" });
    await PATCH(req({ entregue: true, nfNumero: "456" }), { params });
    expect(mocks.avisar).toHaveBeenCalled();
  });
});

describe("estado do pedido", () => {
  it("token inválido → 404", async () => {
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue(null);
    expect((await PATCH(req({ novoPrazo: "2026-10-01" }), { params })).status).toBe(404);
  });

  it("pedido já recebido não aceita mais resposta", async () => {
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue({ ...PEDIDO, dataEntregaReal: new Date() });
    expect((await PATCH(req({ novoPrazo: "2026-10-01" }), { params })).status).toBe(400);
  });

  // ⚠⚠ Entre ler e gravar, alguém pode ter confirmado o recebimento por dentro — a escrita pública
  // não pode passar por cima disso.
  it("⚠⚠ a condição de estado vai no próprio UPDATE, não só na leitura", async () => {
    await PATCH(req({ novoPrazo: "2026-10-01" }), { params });
    expect(mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].where)
      .toEqual({ id: "p1", dataEntregaReal: null });
  });

  it("perdendo a corrida, recusa em vez de gravar", async () => {
    mockPrisma.pedidoOmie.updateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(req({ novoPrazo: "2026-10-01" }), { params });
    expect(res.status).toBe(400);
    expect(mocks.avisar).not.toHaveBeenCalled();
  });
});

describe("a nova previsão", () => {
  it("guarda o prazo combinado ANTES, uma vez só", async () => {
    await PATCH(req({ novoPrazo: "2026-10-01" }), { params });
    expect(mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].data.prazoOriginal)
      .toEqual(PEDIDO.prazoEntregaPrevisto);

    vi.clearAllMocks();
    mockPrisma.pedidoOmie.findUnique.mockResolvedValue({ ...PEDIDO, prazoOriginal: new Date("2026-08-01") });
    mockPrisma.pedidoOmie.updateMany.mockResolvedValue({ count: 1 });
    await PATCH(req({ novoPrazo: "2026-11-01" }), { params });
    expect(mockPrisma.pedidoOmie.updateMany.mock.calls[0][0].data).not.toHaveProperty("prazoOriginal");
  });

  // ⚠ O prefixo é o que separa o recado do fornecedor do comentário interno de Compras — e é por
  // ele que a rota pública decide o que devolver.
  it("⚠ carimba o histórico com [Fornecedor]", async () => {
    await PATCH(req({ novoPrazo: "2026-10-01", motivo: "atraso na laminação" }), { params });
    expect(mockPrisma.prazoHistorico.create.mock.calls[0][0].data.motivo)
      .toBe("[Fornecedor] atraso na laminação");
  });

  it("data impossível é recusada", async () => {
    expect((await PATCH(req({ novoPrazo: "banana" }), { params })).status).toBe(400);
  });
});

// ⚠ Ela já está gravada; dizer ao fornecedor que deu errado o faria tentar de novo, e cada
// tentativa é outro aviso.
describe("⚠ o aviso nunca derruba a resposta", () => {
  it("aviso falhando ainda devolve sucesso ao fornecedor", async () => {
    mocks.avisar.mockRejectedValue(new Error("Resend fora"));
    const res = await PATCH(req({ novoPrazo: "2026-10-01" }), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ⚠ O token viaja por e-mail: não pode ficar em cache intermediário nem vazar no Referer.
describe("⚠ a resposta não deixa rastro do token", () => {
  it("manda no-store e no-referrer", async () => {
    const res = await PATCH(req({ novoPrazo: "2026-10-01" }), { params });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
