import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// ⚠⚠ SÓ SE ETIQUETA O QUE SE EXPEDE. Matheus (08/09/2026): "na listagem das marcas não pode
// aparecer as posições, somente os produtos finais igual sai na Lista de Expedição".
//
// `PecaConjunto` guarda a obra inteira — o conjunto que sobe no caminhão E as posições que o
// compõem. Na OP-97 são 1.236 linhas para 537 itens expedíveis. Estes testes existem porque o
// filtro tem DUAS fontes (o `naLE` da peça e a `ListaExpedicao` importada do SharePoint) e é a
// combinação delas que decide — uma sozinha faz obra inteira sumir da tela.

const mocks = vi.hoisted(() => ({ role: vi.fn(), pdf: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/etiqueta-carregamento-pdf", () => ({ gerarEtiquetasCarregamentoPDF: mocks.pdf }));
import { GET, POST } from "@/app/api/expedicao/etiquetas/route";

// O retrato da OP-97: dois conjuntos e um parafuso na LE, duas posições fora dela.
const PECAS = [
  { id: "p1", marca: "T97A140", descricao: "TRAVAMENTO EL.9325", qte: 1, pesoUnitKg: 4.46, naLE: true },
  { id: "p2", marca: "T97-AC8", descricao: "PARAFUSO SEXT. A325", qte: 40, pesoUnitKg: 0.1, naLE: true },
  { id: "p3", marca: "T97A-P30", descricao: "W150X24", qte: 1, pesoUnitKg: 22, naLE: false },
  { id: "p4", marca: "T97A-P346", descricao: "W150X24", qte: 1, pesoUnitKg: 22, naLE: false },
  { id: "p5", marca: "T97A180", descricao: "VIGA EL.10250", qte: 2, pesoUnitKg: 88, naLE: false },
];
const get = (q = "") => GET(new Request(`http://localhost/api/expedicao/etiquetas${q}`));
const marcas = async (r) => (await r.json()).pecas.map((p) => p.marca);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Expedição" });
  mocks.pdf.mockResolvedValue(new Uint8Array([1]));
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op1", numero: "097", cliente: "MEGASTEAM", obra: "Unipar" });
  mockPrisma.pecaConjunto.findMany.mockResolvedValue(PECAS);
  mockPrisma.auditLog.groupBy.mockResolvedValue([]);
  mockPrisma.listaExpedicao.findMany.mockResolvedValue([]);
});

describe("a lista de marcas é a Lista de Expedição", () => {
  it("as posições de fábrica ficam de fora", async () => {
    expect(await marcas(await get("?opId=op1"))).toEqual(["T97A140", "T97-AC8"]);
  });

  // ⚠ Filtrar por tipoPeca deixaria o parafuso de fora — e ele sobe no caminhão.
  it("acessório sem tipo, mas na LE, continua na lista", async () => {
    expect(await marcas(await get("?opId=op1"))).toContain("T97-AC8");
  });

  it("a marca que só existe na ListaExpedicao importada também entra", async () => {
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([
      { marcasJson: [{ marca: "T97A180", descricao: "VIGA", qte: 2 }] },
    ]);
    expect(await marcas(await get("?opId=op1"))).toEqual(["T97A140", "T97-AC8", "T97A180"]);
  });

  it("compara a marca sem se importar com espaço nem caixa", async () => {
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([{ marcasJson: [{ marca: " t97a180 " }] }]);
    expect(await marcas(await get("?opId=op1"))).toContain("T97A180");
  });

  it("marcasJson vazio, nulo ou torto não derruba a tela", async () => {
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([
      { marcasJson: null }, { marcasJson: [] }, { marcasJson: [{ semMarca: 1 }] },
    ]);
    expect(await marcas(await get("?opId=op1"))).toEqual(["T97A140", "T97-AC8"]);
  });

  // ⚠ "097" e "97" são a mesma obra em tabelas diferentes.
  it("procura a LE pelo id da OP e pelo número com e sem zero à esquerda", async () => {
    await get("?opId=op1");
    const { where } = mockPrisma.listaExpedicao.findMany.mock.calls[0][0];
    expect(where.OR[0]).toEqual({ opId: "op1" });
    expect(where.OR[1].opNumero.in).toEqual(["097", "97"]);
  });

  it("obra sem nenhum item de LE devolve lista vazia — e não a obra inteira", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(PECAS.map((p) => ({ ...p, naLE: false })));
    expect(await marcas(await get("?opId=op1"))).toEqual([]);
  });

  it("o campo naLE não vaza para a tela", async () => {
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas[0]).not.toHaveProperty("naLE");
  });
});

describe("POST — a posição não é etiquetável nem por fora da tela", () => {
  it("pedir uma marca fora da LE é recusado", async () => {
    const r = await POST(new Request("http://localhost/api/expedicao/etiquetas",
      { method: "POST", body: JSON.stringify({ opId: "op1", marcas: ["T97A-P30"] }) }));
    expect(r.status).toBe(400);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it("e o PDF sai só com as marcas da LE que foram pedidas", async () => {
    const r = await POST(new Request("http://localhost/api/expedicao/etiquetas",
      { method: "POST", body: JSON.stringify({ opId: "op1", marcas: ["T97A140", "T97A-P30"] }) }));
    expect(r.status).toBe(200);
    expect(mocks.pdf.mock.calls[0][0].pecas.map((p) => p.marca)).toEqual(["T97A140"]);
  });
});

describe("a lista de obras só traz o que tem LE", () => {
  beforeEach(() => {
    mockPrisma.oP.findMany.mockResolvedValue([
      { id: "op1", numero: "097", cliente: "MEGASTEAM", obra: "Unipar" },
      { id: "op2", numero: "118", cliente: "DANPOWER", obra: null },
      { id: "op3", numero: "101", cliente: "MARKO", obra: null },
      { id: "op4", numero: "999", cliente: "SEM LE", obra: null },
    ]);
  });

  it("some a obra que não tem item expedível em fonte nenhuma", async () => {
    mockPrisma.pecaConjunto.groupBy.mockResolvedValue([{ opId: "op2", _count: { _all: 1641 } }]);
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([
      { opId: "op1", opNumero: "097", marcas: 537 },
      { opId: null, opNumero: "101", marcas: 8 },   // LE sem vínculo de id — casa pelo número
    ]);
    const j = await (await get()).json();
    expect(j.ops.map((o) => [o.numero, o.marcas]))
      .toEqual([["097", 537], ["118", 1641], ["101", 8]]);
  });

  // ⚠ As duas fontes são a MESMA lista por caminhos diferentes: somar contaria a obra duas vezes.
  it("obra presente nas duas fontes conta uma vez só, pelo maior", async () => {
    mockPrisma.pecaConjunto.groupBy.mockResolvedValue([{ opId: "op1", _count: { _all: 537 } }]);
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([{ opId: "op1", opNumero: "097", marcas: 530 }]);
    const j = await (await get()).json();
    expect(j.ops).toHaveLength(1);
    expect(j.ops[0].marcas).toBe(537);
  });

  it("pergunta ao banco só pelas peças da LE", async () => {
    mockPrisma.pecaConjunto.groupBy.mockResolvedValue([]);
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([]);
    await get();
    expect(mockPrisma.pecaConjunto.groupBy.mock.calls[0][0].where).toEqual({ naLE: true });
  });
});
