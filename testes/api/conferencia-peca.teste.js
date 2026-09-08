import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// A rota é a ÚLTIMA palavra sobre o teto da L.E. A tela também valida, mas ela lê um retrato de
// alguns segundos atrás — com duas pessoas conferindo a mesma obra no pátio, o saldo que o celular
// mostra pode já ter sido consumido. Estes testes travam quem decide.

const mocks = vi.hoisted(() => ({ role: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { POST, PUT, DELETE, PATCH, GET } from "@/app/api/expedicao/conferencia/[id]/route";

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
    // ⚠ a lista sai ordenada por marca (localeCompare numérico), não na ordem do banco
    expect(j.marcas).toEqual([
      expect.objectContaining({ marca: "T97-AC8", previsto: 40, conferido: 0, saldo: 40, completa: false }),
      expect.objectContaining({ marca: "T97A140", previsto: 2, conferido: 1, saldo: 1, completa: false }),
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

describe("PUT — corrigir a quantidade já lançada", () => {
  const put = (corpo) => PUT(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(corpo) }), { params });
  const itemGravado = (qte) =>
    mockPrisma.conferenciaPecaItem.findUnique.mockResolvedValue(
      { id: "i1", conferenciaId: "c1", marca: "T97A140", qte });

  it("diminuir uma marca completa passa — o próprio lançamento sai da conta", async () => {
    itemGravado(2); jaConferido([["T97A140", 2]]);   // L.E. prevê 2, este item é as 2
    const r = await put({ itemId: "i1", qte: 1 });
    expect(r.status).toBe(200);
    expect(mockPrisma.conferenciaPecaItem.update.mock.calls[0][0])
      .toMatchObject({ where: { id: "i1" }, data: { qte: 1 } });
  });

  it("aumentar além do previsto é recusado com 409", async () => {
    itemGravado(1); jaConferido([["T97A140", 1]]);
    const r = await put({ itemId: "i1", qte: 5 });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toContain("T97A140");
    expect(mockPrisma.conferenciaPecaItem.update).not.toHaveBeenCalled();
  });

  it("registra o ANTES e o DEPOIS na auditoria", async () => {
    itemGravado(2); jaConferido([["T97A140", 2]]);
    await put({ itemId: "i1", qte: 1 });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data)
      .toMatchObject({ action: "EDITAR_LANCAMENTO_CONFERENCIA", diff: expect.objectContaining({ antes: 2, depois: 1 }) });
  });

  // ⚠ o id sozinho não diz a quem o lançamento pertence.
  it("recusa o lançamento de outra conferência", async () => {
    mockPrisma.conferenciaPecaItem.findUnique.mockResolvedValue(
      { id: "i9", conferenciaId: "OUTRA", marca: "T97A140", qte: 1 });
    expect((await put({ itemId: "i9", qte: 1 })).status).toBe(404);
    expect(mockPrisma.conferenciaPecaItem.update).not.toHaveBeenCalled();
  });

  it("não deixa editar em conferência encerrada", async () => {
    mockPrisma.conferenciaPeca.findUnique.mockResolvedValue({ ...SESSAO, status: "FINALIZADA" });
    expect((await put({ itemId: "i1", qte: 1 })).status).toBe(400);
    expect(mockPrisma.conferenciaPecaItem.update).not.toHaveBeenCalled();
  });

  it.each([[0], [1.5]])("recusa quantidade %s com 400", async (q) => {
    itemGravado(1);
    expect((await put({ itemId: "i1", qte: q })).status).toBe(400);
    expect(mockPrisma.conferenciaPecaItem.update).not.toHaveBeenCalled();
  });

  // ⚠ a observação só é tocada quando vem no corpo — editar a quantidade não pode apagá-la.
  it("não apaga a observação quando o corpo não a manda", async () => {
    itemGravado(2); jaConferido([["T97A140", 2]]);
    await put({ itemId: "i1", qte: 1 });
    expect(mockPrisma.conferenciaPecaItem.update.mock.calls[0][0].data).not.toHaveProperty("observacao");
  });

  it("preserva as permissões de acesso", async () => {
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    expect((await put({ itemId: "i1", qte: 1 })).status).toBe(403);
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
