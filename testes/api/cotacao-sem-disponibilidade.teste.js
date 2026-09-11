import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ role: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/omie-pedido-compra", () => ({ resolverFornecedorPorCnpj: vi.fn() }));
vi.mock("@/lib/email", () => ({ notificarEvento: vi.fn() }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { POST as submeter } from "@/app/api/cotacao/submeter/[token]/route";
import { POST as marcarVencedor } from "@/app/api/cotacao-item/[id]/vencedor/route";

// ⚠⚠ MATHEUS (11/09/2026), sobre a T67-011-R00: "quando eles marcarem sem disponibilidade, mesmo
// que eles preencham números de valores, deve ficar como sem disponibilidade no portal". Este
// arquivo é a prova disso nos caminhos que escrevem no banco — o que foi pedido foi "verifique se
// está funcionando", e olhar a tela não responde: a regra é de servidor.

const req = (url, body) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Comprador" });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("o fornecedor marca 'não tenho' e ainda assim digita preço", () => {
  beforeEach(() => {
    mockPrisma.cotacao.findUnique.mockResolvedValue({
      id: "cot1", token: "tk", status: "ENVIADA", nCodOmie: null,
      itens: [{ id: "ci-sem" }, { id: "ci-com" }],
    });
    mockPrisma.cotacao.update.mockResolvedValue({ id: "cot1" });
    mockPrisma.cotacaoItem.update.mockResolvedValue({});
    mockPrisma.cotacaoItem.findMany.mockResolvedValue([]);
    mockPrisma.rMItem.updateMany.mockResolvedValue({ count: 0 });
  });

  // ⚠⚠ É A REGRA CENTRAL DO PEDIDO. Se o preço sobrevivesse à flag, o item voltaria a competir no
  // mapa — e um preço irrisório como o R$ 2,00 da SOUFER ganha por ser o menor.
  it("o preço é ZERADO no servidor, não só escondido na tela", async () => {
    const r = await submeter(req("http://localhost/api/cotacao/submeter/tk", {
      itens: [
        { cotacaoItemId: "ci-sem", precoUnit: 2, qtdCotada: 109.2, icmsPct: 12, ipiPct: 5, semEstoque: true },
        { cotacaoItemId: "ci-com", precoUnit: 7.8, qtdCotada: 109.2, semEstoque: false },
      ],
    }), { params: { token: "tk" } });
    expect(r.status).toBe(200);

    const porId = Object.fromEntries(
      mockPrisma.cotacaoItem.update.mock.calls.map((c) => [c[0].where.id, c[0].data])
    );
    expect(porId["ci-sem"]).toMatchObject({ precoUnit: 0, qtdCotada: 0, semEstoque: true, icmsPct: null, ipiPct: null });
    // o item honesto do mesmo envio não é afetado
    expect(porId["ci-com"]).toMatchObject({ precoUnit: 7.8, semEstoque: false });
  });

  // ⚠ A proposta com TODOS os itens marcados não é gravada como proposta vazia nem aceita: o
  // fornecedor tem de dizer alguma coisa. Hoje a rota recusa, e isso é o comportamento atual —
  // congelado aqui para a mudança ser deliberada se um dia alguém quiser aceitar.
  it("proposta inteira marcada como 'não tenho' é recusada com mensagem", async () => {
    const r = await submeter(req("http://localhost/api/cotacao/submeter/tk", {
      itens: [{ cotacaoItemId: "ci-sem", precoUnit: 2, qtdCotada: 1, semEstoque: true }],
    }), { params: { token: "tk" } });
    expect(r.status).toBe(400);
    expect(mockPrisma.cotacaoItem.update).not.toHaveBeenCalled();
  });
});

describe("marcar vencedor", () => {
  // ⚠⚠ O FURO QUE EXISTIA. A tela não deixa clicar na célula de um item sem disponibilidade, mas a
  // regra morava SÓ na tela — e é do vencedor que sai o pedido no Omie.
  it("recusa item que o fornecedor marcou como sem disponibilidade", async () => {
    mockPrisma.cotacaoItem.findUnique.mockResolvedValue({
      id: "ci1", rmItemId: "rmi", cotacaoId: "cot1", semEstoque: true, precoUnit: 0,
    });
    const r = await marcarVencedor(req("http://localhost/x", { vencedor: true }), { params: { id: "ci1" } });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/n[ãa]o tem disponibilidade/i);
    expect(mockPrisma.cotacaoItem.update).not.toHaveBeenCalled();
  });

  // Vencedor sem preço o gerador ignoraria em silêncio, e o comprador ficaria esperando um pedido
  // que nunca sai.
  it("recusa item sem preço", async () => {
    mockPrisma.cotacaoItem.findUnique.mockResolvedValue({
      id: "ci1", rmItemId: "rmi", cotacaoId: "cot1", semEstoque: false, precoUnit: 0,
    });
    expect((await marcarVencedor(req("http://localhost/x", { vencedor: true }), { params: { id: "ci1" } })).status).toBe(409);
  });

  it("aceita item normal", async () => {
    mockPrisma.cotacaoItem.findUnique.mockResolvedValue({
      id: "ci1", rmItemId: "rmi", cotacaoId: "cot1", semEstoque: false, precoUnit: 7.8,
    });
    mockPrisma.cotacaoItem.update.mockResolvedValue({});
    expect((await marcarVencedor(req("http://localhost/x", { vencedor: true }), { params: { id: "ci1" } })).status).toBe(200);
    expect(mockPrisma.cotacaoItem.update).toHaveBeenCalled();
  });

  // ⚠ DESMARCAR CONTINUA LIVRE. A trava é para não deixar um item indisponível VIRAR vencedor; se
  // um já está marcado (dado antigo, como a SOUFER da T67-011-R00), tirá-lo é o conserto.
  it("desmarcar não é bloqueado, nem num item sem disponibilidade", async () => {
    mockPrisma.cotacaoItem.findUnique.mockResolvedValue({
      id: "ci1", rmItemId: "rmi", cotacaoId: "cot1", semEstoque: true, precoUnit: 0,
    });
    mockPrisma.cotacaoItem.update.mockResolvedValue({});
    expect((await marcarVencedor(req("http://localhost/x", { vencedor: false }), { params: { id: "ci1" } })).status).toBe(200);
  });
});
