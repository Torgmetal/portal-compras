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

// ⚠⚠ OS OBRIGATÓRIOS DA ROTA, em um lugar só. Em 21/09/2026 CNPJ, número da proposta, prazo e
// condição de pagamento passaram a ser exigidos NO SERVIDOR, não só no formulário (Matheus: "não
// deixe o fornecedor conseguir enviar a proposta sem preencher os campos obrigatórios"). Os testes
// abaixo começaram a tomar 400 — sinal certo: o contrato mudou de propósito, como já tinha
// acontecido com o frete em 17/09.
const OBRIGATORIOS = {
  tipoFrete: "CIF",
  cnpj: "45.987.062/0001-77",
  numeroProposta: "20250698",
  prazoEntrega: "3 dias úteis",
  condicaoPagamento: "28/42/56",
};

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
      ...OBRIGATORIOS,
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

// ─── O frete é obrigatório, e a trava é do SERVIDOR (Matheus, 17/09/2026) ────
//
// ⚠⚠ A tela já bloqueia, mas a tela é a parte fácil. O que esta prova protege é o resto: aba
// aberta antes desta versão, reenvio, qualquer POST fora do formulário. Sem a trava no servidor, o
// campo seria "obrigatório" só para quem não tivesse motivo de burlá-lo — e aí o comprador
// continuaria sem saber o que precisa coletar, que é o motivo do campo existir.
describe("frete obrigatório na submissão", () => {
  beforeEach(() => {
    mockPrisma.cotacao.findUnique.mockResolvedValue({
      id: "cot1", token: "tk", status: "ENVIADA", nCodOmie: null, itens: [{ id: "ci-com" }],
    });
    mockPrisma.cotacao.update.mockResolvedValue({ id: "cot1" });
    mockPrisma.cotacaoItem.update.mockResolvedValue({});
    mockPrisma.cotacaoItem.findMany.mockResolvedValue([]);
    mockPrisma.rMItem.updateMany.mockResolvedValue({ count: 0 });
  });

  // ⚠ Traz os demais obrigatórios, para o teste do FRETE medir o frete e não esbarrar no CNPJ.
  const corpo = (extra) => ({
    itens: [{ cotacaoItemId: "ci-com", precoUnit: 7.8, qtdCotada: 109.2, semEstoque: false }],
    ...OBRIGATORIOS,
    tipoFrete: undefined,
    ...extra,
  });

  it("sem frete, recusa com a mensagem que o FORNECEDOR precisa ler", async () => {
    const r = await submeter(req("http://localhost/api/cotacao/submeter/tk", corpo()), { params: { token: "tk" } });
    expect(r.status).toBe(400);
    const { error } = await r.json();
    expect(error).toContain("CIF");
    expect(error).toContain("FOB");
    // ⚠ e não o despejo JSON do Zod, que era o que a rota devolvia antes
    expect(error).not.toContain('"code"');
    expect(mockPrisma.cotacao.update).not.toHaveBeenCalled();
  });

  it("valor fora da lista também é recusado", async () => {
    const r = await submeter(req("http://localhost/api/cotacao/submeter/tk", corpo({ tipoFrete: "por conta deles" })), { params: { token: "tk" } });
    expect(r.status).toBe(400);
    expect(mockPrisma.cotacao.update).not.toHaveBeenCalled();
  });

  it("com CIF ou FOB, grava o que o fornecedor escolheu", async () => {
    for (const v of ["CIF", "FOB"]) {
      mockPrisma.cotacao.update.mockClear();
      const r = await submeter(req("http://localhost/api/cotacao/submeter/tk", corpo({ tipoFrete: v })), { params: { token: "tk" } });
      expect(r.status, v).toBe(200);
      expect(mockPrisma.cotacao.update.mock.calls[0][0].data).toMatchObject({ tipoFrete: v });
    }
  });
});
