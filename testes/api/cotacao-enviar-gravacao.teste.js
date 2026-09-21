import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ role: vi.fn(), sendEmail: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/cotacao-estoque", () => ({ calcularAbatimentoEstoque: async () => ({ porItem: new Map(), abatidos: [], excluidos: [] }) }));
vi.mock("@/lib/faturamento-direto", () => ({ mapearFDPorRM: async () => new Map(), itemEhFD: () => false }));

import { POST as enviar } from "@/app/api/cotacao/enviar/route";

// "O servidor respondeu 500 sem detalhes" (Compras, 21/09/2026, T122-001 com 7 fornecedores).
// A função roda em iad1 (Washington) e o Neon fica em sa-east-1 (São Paulo): ~120 ms por
// statement. A transação escrevia UMA linha por vez — 7 cotações × 9 itens = 63 inserts de item,
// mais cotações, envios e status ≈ 85 idas e voltas ≈ 10 s — contra o teto padrão de 5 s do
// Prisma. E no mesmo horário o log de produção mostrou P1001 "Can't reach database server".

const req = (body) =>
  new Request("http://localhost/api/cotacao/enviar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const rm = {
  id: "rm1", numero: "T122-001", status: "ABERTA", tipoRM: "ENGENHARIA",
  itens: [
    { id: "i1", rmId: "rm1", status: "PENDENTE", qtd: 135, peso: 2551.5, opItem: null, aditivoItem: null },
    { id: "i2", rmId: "rm1", status: "PENDENTE", qtd: 3, peso: 957.6, opItem: null, aditivoItem: null },
    { id: "i3", rmId: "rm1", status: "PENDENTE", qtd: 1, peso: 0, opItem: null, aditivoItem: null },
  ],
};
const fornecedores = [
  { fornecedorId: "f1", nome: "Gerdau Aços Longos", email: "vendas@gerdau.com.br", cnpj: "07358761000169", nCodOmie: "7318285259" },
  { fornecedorId: "f2", nome: "ArcelorMittal", email: "equipe.paralegal@arcelormittal.com.br" },
];
const corpo = { rmIds: ["rm1"], itensIds: ["i1", "i2", "i3"], fornecedores, prazoResposta: "2026-09-26" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", email: "compras@torg.com.br" });
  mocks.sendEmail.mockResolvedValue({ ok: true, id: "re_1" });
  mockPrisma.rM.findMany.mockResolvedValue([rm]);
  mockPrisma.cotacao.createManyAndReturn.mockImplementation(async ({ data }) => data.map((d, i) => ({ id: `cot${i + 1}`, token: d.token, fornecedorNome: d.fornecedorNome, fornecedorEmail: d.fornecedorEmail })));
  mockPrisma.cotacaoItem.createMany.mockResolvedValue({ count: 6 });
  mockPrisma.envio.createMany.mockResolvedValue({ count: 2 });
  mockPrisma.rMItem.updateMany.mockResolvedValue({ count: 3 });
  mockPrisma.rM.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("a gravação vai em LOTE, não linha a linha", () => {
  it("2 fornecedores × 3 itens = 1 insert de cotações, 1 de itens, 1 de envios", async () => {
    const r = await enviar(req(corpo));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.cotacoes).toHaveLength(2);
    expect(json.cotacoes.map((c) => c.fornecedorNome)).toEqual(["GERDAU AÇOS LONGOS", "ARCELORMITTAL"]);
    expect(json.cotacoes.every((c) => c.token && c.id)).toBe(true);

    expect(mockPrisma.cotacao.create).not.toHaveBeenCalled();
    expect(mockPrisma.cotacao.createManyAndReturn).toHaveBeenCalledTimes(1);
    const cots = mockPrisma.cotacao.createManyAndReturn.mock.calls[0][0].data;
    expect(cots).toHaveLength(2);
    expect(cots[0]).toMatchObject({ rmId: "rm1", fornecedorNome: "GERDAU AÇOS LONGOS", fornecedorEmail: "vendas@gerdau.com.br", cnpj: "07358761000169", nCodOmie: "7318285259", faturamento: "Torg", status: "PENDENTE" });
    expect(cots[1]).toMatchObject({ fornecedorNome: "ARCELORMITTAL", fornecedorId: "f2", cnpj: null, nCodOmie: null });
    expect(new Set(cots.map((c) => c.token)).size).toBe(2);

    expect(mockPrisma.cotacaoItem.createMany).toHaveBeenCalledTimes(1);
    const itens = mockPrisma.cotacaoItem.createMany.mock.calls[0][0].data;
    expect(itens).toHaveLength(6);
    // peso em kg quando há peso; quantidade quando não há (o item i3 é "Peça")
    expect(itens.filter((x) => x.cotacaoId === "cot1").map((x) => [x.rmItemId, x.qtdCotada, x.precoUnit])).toEqual([["i1", 2551.5, 0], ["i2", 957.6, 0], ["i3", 1, 0]]);

    expect(mockPrisma.envio.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.envio.createMany.mock.calls[0][0].data).toEqual([
      { rmId: "rm1", fornecedorNome: "GERDAU AÇOS LONGOS", fornecedorEmail: "vendas@gerdau.com.br" },
      { rmId: "rm1", fornecedorNome: "ARCELORMITTAL", fornecedorEmail: "equipe.paralegal@arcelormittal.com.br" },
    ]);
    expect(mockPrisma.rMItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["i1", "i2", "i3"] }, status: "PENDENTE" }, data: { status: "EM_COTACAO" } }));
    expect(mockPrisma.rM.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["rm1"] } }, data: { status: "EM_COTACAO" } }));
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail.mock.calls.map((c) => c[0].to).sort()).toEqual(["equipe.paralegal@arcelormittal.com.br", "vendas@gerdau.com.br"]);
  });

  // ⚠ A transação tem teto explícito, folgado: o padrão de 5 s foi o que derrubou a T122-001.
  it("a transação pede teto explícito bem acima dos 5 s padrão", async () => {
    const { OPCOES_TX } = await import("@/lib/cotacao-envio-gravacao");
    expect(OPCOES_TX.timeout).toBeGreaterThanOrEqual(20_000);
    expect(OPCOES_TX.maxWait).toBeGreaterThanOrEqual(5_000);
  });

  // `createManyAndReturn` devolve linhas, não promessa de ordem: cada cotação casa pelo token.
  it("casa o que voltou do banco pelo token, mesmo fora de ordem", async () => {
    mockPrisma.cotacao.createManyAndReturn.mockImplementation(async ({ data }) =>
      [...data].reverse().map((d, i) => ({ id: `inv${i}`, token: d.token, fornecedorNome: d.fornecedorNome, fornecedorEmail: d.fornecedorEmail })));
    const r = await enviar(req(corpo));
    const { cotacoes } = await r.json();
    expect(cotacoes.map((c) => [c.fornecedorNome, c.id])).toEqual([["GERDAU AÇOS LONGOS", "inv1"], ["ARCELORMITTAL", "inv0"]]);
    const itens = mockPrisma.cotacaoItem.createMany.mock.calls[0][0].data;
    expect(itens.filter((x) => x.cotacaoId === "inv1")).toHaveLength(3);
  });
});

describe("quando o banco falha", () => {
  // O P1001 é transitório (cold start / blip do pooler): tentar de novo resolve na maioria das
  // vezes, e nada foi gravado — a transação anterior foi desfeita inteira.
  it("P1001 no meio da transação: tenta de novo e conclui, sem duplicar", async () => {
    mockPrisma.cotacao.createManyAndReturn
      .mockRejectedValueOnce(Object.assign(new Error("Can't reach database server at `ep-…-pooler.sa-east-1.aws.neon.tech:5432`"), { code: "P1001" }))
      .mockImplementationOnce(async ({ data }) => data.map((d, i) => ({ id: `cot${i + 1}`, token: d.token, fornecedorNome: d.fornecedorNome, fornecedorEmail: d.fornecedorEmail })));
    const r = await enviar(req(corpo));
    expect(r.status).toBe(200);
    expect(mockPrisma.cotacao.createManyAndReturn).toHaveBeenCalledTimes(2);
    expect(mockPrisma.cotacaoItem.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
  }, 10_000);

  // ⚠ Erro que a tela não mostra é erro que ninguém relata. Antes: exceção solta → 500 em HTML da
  // Vercel → "O servidor respondeu 500 sem detalhes".
  it("erro que não é de conexão vira 500 em JSON, com a causa, e nenhum e-mail sai", async () => {
    mockPrisma.cotacaoItem.createMany.mockRejectedValue(new Error("Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 6321 ms passed since the start of the transaction."));
    const r = await enviar(req(corpo));
    expect(r.status).toBe(500);
    const { error } = await r.json();
    expect(error).toMatch(/^Não consegui gravar a cotação/);
    expect(error).toContain("expired transaction");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mockPrisma.cotacao.createManyAndReturn).toHaveBeenCalledTimes(1);
  });

  it("prazo de resposta inválido é 400, não 500 da Vercel", async () => {
    const r = await enviar(req({ ...corpo, prazoResposta: "2026-13-45" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/prazo de resposta/i);
    expect(mockPrisma.cotacao.createManyAndReturn).not.toHaveBeenCalled();
  });
});
