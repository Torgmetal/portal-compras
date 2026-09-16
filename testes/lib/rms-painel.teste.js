import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));

const { buscarRMsDoPainel, obrasDoEscopo, escopoRMs, normalizarOp, agregarCotacoes, LIMITE_SEM_OBRA } =
  await import("@/lib/rms-painel");

// ⚠⚠ O BUG QUE ESTE ARQUIVO TRAVA. Matheus (16/09/2026), olhando a OP-097: "existe 7 RMs mas na
// tela de RMs histórico e filtro por OP-097 só aparece 3 (…) analise em todas as obras, eu preciso
// ter um filtro completo de tudo referente a obra, não pode ocorrer isso."
//
// A tela buscava as 100 RMs mais recentes e o filtro de obra rodava DEPOIS, no navegador. Medido no
// banco naquele dia: 211 RMs no histórico, 111 invisíveis, 24 das 37 obras incompletas (a OP-060
// mostrava 1 de 21) e 11 obras sem nenhuma linha na janela — ausentes até do seletor de OP.

const listaVazia = () => {
  mockPrisma.rM.findMany.mockResolvedValue([]);
  mockPrisma.rM.count.mockResolvedValue(0);
  mockPrisma.rM.groupBy.mockResolvedValue([]);
  mockPrisma.oP.findMany.mockResolvedValue([]);
};

beforeEach(() => {
  vi.clearAllMocks();
  listaVazia();
});

/** O `where`/`take` que foi realmente pedido ao Prisma na busca da lista. */
const consultaFeita = () => mockPrisma.rM.findMany.mock.calls.at(-1)[0];

describe("buscarRMsDoPainel — a obra escolhida vem INTEIRA", () => {
  it("⚠⚠ com obra escolhida NÃO existe teto: era isso que escondia 4 das 7 RMs da OP-097", async () => {
    await buscarRMsDoPainel("ENGENHARIA", true, "097");
    expect(consultaFeita().take).toBeUndefined();
  });

  it("⚠⚠ o filtro da obra vai para o BANCO, não para o navegador", async () => {
    await buscarRMsDoPainel("ENGENHARIA", true, "097");
    expect(consultaFeita().where).toMatchObject({ op: { numero: "097" } });
  });

  it("sem obra escolhida o teto continua — o Neon é pequeno e 53200 é OOM", async () => {
    await buscarRMsDoPainel("ENGENHARIA", true, null);
    expect(consultaFeita().take).toBe(LIMITE_SEM_OBRA);
    expect(consultaFeita().where.op).toBeUndefined();
  });

  it("⚠ a contagem total é do MESMO escopo da lista — é ela que denuncia o corte", async () => {
    mockPrisma.rM.findMany.mockResolvedValue(Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` })));
    mockPrisma.rM.count.mockResolvedValue(211);
    const { total, truncada } = await buscarRMsDoPainel("ENGENHARIA", true, null);
    expect(total).toBe(211);
    expect(truncada).toBe(true);
  });

  it("lista que cabe inteira não é marcada como truncada", async () => {
    mockPrisma.rM.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    mockPrisma.rM.count.mockResolvedValue(2);
    expect((await buscarRMsDoPainel("ENGENHARIA", false, null)).truncada).toBe(false);
  });
});

describe("escopoRMs — cada aba tem os seus status", () => {
  it("Ativas são as três em andamento", () => {
    expect(escopoRMs("ENGENHARIA", false)).toEqual({
      tipoRM: "ENGENHARIA", status: { in: ["ABERTA", "EM_COTACAO", "COTADA"] },
    });
  });

  it("Histórico são pedido gerado e cancelada", () => {
    expect(escopoRMs("INTERNA", true).status.in).toEqual(["PEDIDO_GERADO", "CANCELADA"]);
  });
});

describe("normalizarOp — OP inexistente não vira 'todas'", () => {
  it("⚠⚠ lixo na URL devolve null, e null com filtro pedido tem que dar lista vazia, não a lista toda", () => {
    expect(normalizarOp("../../etc")).toBe(null);
    expect(normalizarOp("' OR 1=1")).toBe(null);
    expect(normalizarOp("x".repeat(50))).toBe(null);
  });

  it("aceita os formatos reais de número de OP", () => {
    expect(normalizarOp("097")).toBe("097");
    expect(normalizarOp("036-01")).toBe("036-01");
    expect(normalizarOp(" 060 ")).toBe("060");
  });

  it("vazio e ausente são 'todas as OPs'", () => {
    expect(normalizarOp("")).toBe(null);
    expect(normalizarOp(undefined)).toBe(null);
  });
});

describe("obrasDoEscopo — as opções do seletor saem do banco", () => {
  const escopo = escopoRMs("ENGENHARIA", true);

  it("⚠⚠ a obra aparece mesmo sem NENHUMA linha na janela das 100 — 11 obras sumiam por isso", async () => {
    mockPrisma.rM.groupBy.mockResolvedValue([{ opId: "op92", _count: { _all: 6 } }]);
    mockPrisma.oP.findMany.mockResolvedValue([{ id: "op92", numero: "092", cliente: "INPASA" }]);
    const obras = await obrasDoEscopo(escopo);
    expect(obras).toEqual([{ numero: "092", cliente: "INPASA", quantidade: 6 }]);
  });

  it("⚠ leva a contagem de cada obra — o número que denuncia divergência futura", async () => {
    mockPrisma.rM.groupBy.mockResolvedValue([
      { opId: "a", _count: { _all: 21 } },
      { opId: "b", _count: { _all: 7 } },
    ]);
    mockPrisma.oP.findMany.mockResolvedValue([
      { id: "a", numero: "060", cliente: "CONSÓRCIO EESB" },
      { id: "b", numero: "097", cliente: "MEGASTEAM" },
    ]);
    const obras = await obrasDoEscopo(escopo);
    expect(obras.find((o) => o.numero === "060").quantidade).toBe(21);
    expect(obras.find((o) => o.numero === "097").quantidade).toBe(7);
  });

  it("maior número de OP primeiro", async () => {
    mockPrisma.rM.groupBy.mockResolvedValue([
      { opId: "a", _count: { _all: 1 } },
      { opId: "b", _count: { _all: 1 } },
      { opId: "c", _count: { _all: 1 } },
    ]);
    mockPrisma.oP.findMany.mockResolvedValue([
      { id: "a", numero: "060", cliente: "" },
      { id: "b", numero: "104", cliente: "" },
      { id: "c", numero: "097", cliente: "" },
    ]);
    expect((await obrasDoEscopo(escopo)).map((o) => o.numero)).toEqual(["104", "097", "060"]);
  });

  it("⚠ RM sem OP não vira opção fantasma — as 34 internas são todas assim", async () => {
    mockPrisma.rM.groupBy.mockResolvedValue([{ opId: null, _count: { _all: 34 } }]);
    expect(await obrasDoEscopo(escopoRMs("INTERNA", true))).toEqual([]);
    expect(mockPrisma.oP.findMany).not.toHaveBeenCalled();
  });

  it("⚠ não carrega itens nem cotações só para montar um <select>", async () => {
    mockPrisma.rM.groupBy.mockResolvedValue([]);
    await obrasDoEscopo(escopo);
    expect(mockPrisma.rM.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ["opId"], where: escopo })
    );
  });
});

describe("agregarCotacoes — o resumo de cotações de cada RM", () => {
  const rm = () => ({ id: "rm1", _count: { cotacoes: 0, itens: 3 } });
  const ponte = (cotacaoId) => ({ cotacaoId, rmItem: { rmId: "rm1" } });

  it("cotação consolidada conta para a RM que ela toca por um item", async () => {
    const r = rm();
    mockPrisma.cotacaoItem.findMany.mockResolvedValue([ponte("c1"), ponte("c2"), ponte("c1")]);
    mockPrisma.cotacao.findMany.mockResolvedValue([
      { id: "c1", status: "RECEBIDA", prazoResposta: null },
      { id: "c2", status: "PENDENTE", prazoResposta: null },
    ]);
    await agregarCotacoes([r], null, "teste");
    expect(r._count.cotacoes).toBe(2);
    expect(r.recebidas).toBe(1);
    expect(r.pendentes).toBe(1);
  });

  it("⚠ atrasada é PENDENTE com prazo vencido — proposta que chegou não atrasa mais", async () => {
    const r = rm();
    mockPrisma.cotacaoItem.findMany.mockResolvedValue([ponte("c1"), ponte("c2")]);
    mockPrisma.cotacao.findMany.mockResolvedValue([
      { id: "c1", status: "PENDENTE", prazoResposta: new Date("2020-01-01") },
      { id: "c2", status: "RECEBIDA", prazoResposta: new Date("2020-01-01") },
    ]);
    await agregarCotacoes([r], null, "teste");
    expect(r.atrasadas).toBe(1);
  });

  it("⚠⚠ falha na agregação não derruba a tela — a lista é o dado, o resumo é enfeite", async () => {
    const r = rm();
    mockPrisma.cotacaoItem.findMany.mockRejectedValue(new Error("out of memory"));
    const registro = { erro: vi.fn() };
    await expect(agregarCotacoes([r], registro, "/compras")).resolves.toBeUndefined();
    expect(r.recebidas).toBe(0);
    expect(registro.erro).toHaveBeenCalled();
  });

  it("lista vazia não consulta nada", async () => {
    await agregarCotacoes([], null, "teste");
    expect(mockPrisma.cotacaoItem.findMany).not.toHaveBeenCalled();
  });
});
