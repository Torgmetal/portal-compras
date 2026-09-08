import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// A rota é a ÚLTIMA palavra sobre o teto da L.E. A tela também valida, mas ela lê um retrato de
// alguns segundos atrás — com duas pessoas conferindo a mesma obra no pátio, o saldo que o celular
// mostra pode já ter sido consumido. Estes testes travam quem decide.

const mocks = vi.hoisted(() => ({ role: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { POST, DELETE, PATCH, GET } from "@/app/api/expedicao/conferencia/[id]/route";

const SESSAO = { id: "c1", opId: "op1", opNumero: "097", status: "ABERTA", observacao: null,
  iniciadaEm: new Date(), iniciadaPorNome: "Zé", finalizadaEm: null, finalizadaPorNome: null };
const PECAS = [
  { id: "p1", marca: "T97A140", descricao: "TRAVAMENTO", qte: 2, naLE: true },
  { id: "p2", marca: "T97-AC8", descricao: "PARAFUSO", qte: 40, naLE: true },
  { id: "p3", marca: "T97A-P30", descricao: "W150X24", qte: 1, naLE: false }, // posição: fora da L.E.
];
const params = { id: "c1" };
const req = (corpo, url = "http://localhost/api/expedicao/conferencia/c1") =>
  new Request(url, { method: "POST", body: JSON.stringify(corpo) });

/** o que já foi conferido na OBRA, como o groupBy devolve */
const jaConferido = (pares) =>
  mockPrisma.conferenciaPecaItem.groupBy.mockResolvedValue(
    pares.map(([marca, qte]) => ({ marca, _sum: { qte } })));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Zé" });
  mockPrisma.conferenciaPeca.findUnique.mockResolvedValue(SESSAO);
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op1", numero: "097", cliente: "MEGASTEAM", obra: "Unipar" });
  mockPrisma.pecaConjunto.findMany.mockResolvedValue(PECAS);
  mockPrisma.listaExpedicao.findMany.mockResolvedValue([]);
  mockPrisma.conferenciaPeca.findMany.mockResolvedValue([{ id: "c1" }]);
  jaConferido([]);
  mockPrisma.conferenciaPecaItem.findMany.mockResolvedValue([]);
});

describe("POST — o vínculo com a Lista de Expedição", () => {
  it("grava o que cabe e devolve o estado recalculado", async () => {
    const r = await POST(req({ marca: "T97A140", qte: 2 }), { params });
    expect(r.status).toBe(200);
    expect(mockPrisma.conferenciaPecaItem.create).toHaveBeenCalled();
    expect(mockPrisma.conferenciaPecaItem.create.mock.calls[0][0].data)
      .toMatchObject({ conferenciaId: "c1", marca: "T97A140", qte: 2, criadoPorNome: "Zé" });
    const j = await r.json();
    expect(j.marcas.find((m) => m.marca === "T97A140")).toMatchObject({ previsto: 2 });
  });

  // ⚠ O CASO DO PEDIDO: 3 na mão, 2 na lista.
  it("recusa com 409 quando passa do previsto, e não grava nada", async () => {
    const r = await POST(req({ marca: "T97A140", qte: 3 }), { params });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.recusado).toBe(true);
    expect(j.error).toContain("T97A140");
    expect(mockPrisma.conferenciaPecaItem.create).not.toHaveBeenCalled();
  });

  // ⚠⚠ O TETO É DA OBRA, NÃO DA SESSÃO.
  it("conta o que outra conferência da mesma obra já pegou", async () => {
    mockPrisma.conferenciaPeca.findMany.mockResolvedValue([{ id: "c0" }, { id: "c1" }]);
    jaConferido([["T97A140", 2]]);
    const r = await POST(req({ marca: "T97A140", qte: 1 }), { params });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toContain("completa");
  });

  it("sessão CANCELADA não entra na soma — é o desfazer de quem abriu por engano", async () => {
    await POST(req({ marca: "T97A140", qte: 1 }), { params });
    expect(mockPrisma.conferenciaPeca.findMany.mock.calls[0][0].where)
      .toMatchObject({ opId: "op1", status: { not: "CANCELADA" } });
  });

  // ⚠ posição de fábrica não se confere: ela vai soldada dentro do conjunto.
  it("marca fora da L.E. é recusada, com mensagem própria", async () => {
    const r = await POST(req({ marca: "T97A-P30", qte: 1 }), { params });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toContain("não está na Lista de Expedição");
  });

  it("grava a marca do cadastro, não a digitada no celular", async () => {
    await POST(req({ marca: "  t97a140 ", qte: 1 }), { params });
    expect(mockPrisma.conferenciaPecaItem.create.mock.calls[0][0].data.marca).toBe("T97A140");
  });

  it.each([
    ["quantidade zero", { marca: "T97A140", qte: 0 }],
    ["quantidade quebrada", { marca: "T97A140", qte: 1.5 }],
    ["sem marca", { qte: 1 }],
  ])("recusa %s com 400", async (_n, corpo) => {
    const r = await POST(req(corpo), { params });
    expect(r.status).toBe(400);
    expect(mockPrisma.conferenciaPecaItem.create).not.toHaveBeenCalled();
  });

  it("conferência já encerrada não aceita lançamento", async () => {
    mockPrisma.conferenciaPeca.findUnique.mockResolvedValue({ ...SESSAO, status: "FINALIZADA" });
    expect((await POST(req({ marca: "T97A140", qte: 1 }), { params })).status).toBe(400);
    expect(mockPrisma.conferenciaPecaItem.create).not.toHaveBeenCalled();
  });

  it("preserva as permissões de acesso", async () => {
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    expect((await POST(req({ marca: "T97A140", qte: 1 }), { params })).status).toBe(403);
    expect(mockPrisma.conferenciaPecaItem.create).not.toHaveBeenCalled();
  });
});

describe("GET — o saldo que a tela mostra", () => {
  it("traz previsto, conferido e saldo de cada marca da L.E.", async () => {
    jaConferido([["T97A140", 1]]);
    const j = await (await GET(new Request("http://localhost/x"), { params })).json();
    // a ordem é a do banco (orderBy marca) — aqui, a do mock
    expect(j.marcas).toEqual([
      expect.objectContaining({ marca: "T97A140", previsto: 2, conferido: 1, saldo: 1, completa: false }),
      expect.objectContaining({ marca: "T97-AC8", previsto: 40, conferido: 0, saldo: 40, completa: false }),
    ]);
    expect(j.progresso).toMatchObject({ previsto: 42, conferido: 1 });
  });

  it("as posições não aparecem na lista da obra", async () => {
    const j = await (await GET(new Request("http://localhost/x"), { params })).json();
    expect(j.marcas.map((m) => m.marca)).not.toContain("T97A-P30");
  });
});

describe("DELETE — desfazer o lançamento errado", () => {
  const del = (item) => DELETE(new Request(`http://localhost/x?item=${item}`, { method: "DELETE" }), { params });

  it("apaga o lançamento desta conferência", async () => {
    mockPrisma.conferenciaPecaItem.findUnique.mockResolvedValue(
      { id: "i1", conferenciaId: "c1", marca: "T97A140", qte: 1 });
    expect((await del("i1")).status).toBe(200);
    expect(mockPrisma.conferenciaPecaItem.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });

  // ⚠ sem esta checagem, o id de um lançamento de OUTRA conferência apagaria por aqui.
  it("recusa o lançamento de outra conferência", async () => {
    mockPrisma.conferenciaPecaItem.findUnique.mockResolvedValue(
      { id: "i9", conferenciaId: "OUTRA", marca: "X", qte: 1 });
    expect((await del("i9")).status).toBe(404);
    expect(mockPrisma.conferenciaPecaItem.delete).not.toHaveBeenCalled();
  });
});

describe("PATCH — encerrar", () => {
  const patch = (corpo) => PATCH(req(corpo), { params });

  it.each([["finalizar", "FINALIZADA"], ["cancelar", "CANCELADA"]])("%s grava status %s", async (acao, status) => {
    mockPrisma.conferenciaPeca.update.mockResolvedValue({ id: "c1", status });
    const r = await patch({ acao });
    expect(r.status).toBe(200);
    expect(mockPrisma.conferenciaPeca.update.mock.calls[0][0].data.status).toBe(status);
  });

  it("ação inventada é recusada", async () => {
    expect((await patch({ acao: "apagar-tudo" })).status).toBe(400);
    expect(mockPrisma.conferenciaPeca.update).not.toHaveBeenCalled();
  });
});
