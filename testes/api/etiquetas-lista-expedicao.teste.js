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

// ⚠⚠ Matheus (08/09/2026): "verifique o porquê está repetindo a mesma marca várias vezes na lista,
// não faz sentido isso". Não é dado sujo: o `@@unique([opNumero, marca])` deixa a MESMA peça existir
// uma vez por chave de OP, e a mesma obra tem várias — a OP-89 tem "89", "089", "T89A" e "T89C",
// então 809 linhas para 284 marcas.
describe("a mesma marca em várias chaves de OP vira UMA linha", () => {
  const TRES = [
    { id: "a", marca: "T89A10", descricao: "L1.1/2''X1/8''", qte: 2, naLE: true, fonte: "LPC_IMPORT" },
    { id: "b", marca: "T89A10", descricao: "CONTRAVENTAMENTO", qte: 1, naLE: true, fonte: "LE_IMPORT" },
    { id: "c", marca: "T89A10", descricao: "CONTRAVENTAMENTO", qte: 1, naLE: true, fonte: "LE_IMPORT" },
  ];

  it("três cópias viram uma marca só", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(TRES);
    expect(await marcas(await get("?opId=op1"))).toEqual(["T89A10"]);
  });

  // ⚠ ESCOLHE, NÃO SOMA: são três visões da mesma peça, não três peças.
  it("não soma as quantidades", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(TRES);
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas[0].qte).toBe(1);
  });

  // ⚠ quem expede lê a L.E.: é o texto que sai impresso na etiqueta colada na peça.
  it("a linha da L.E. ganha da do LPC, inclusive na descrição", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(TRES);
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas[0].descricao).toBe("CONTRAVENTAMENTO");
    expect(j.pecas[0].id).toBe("b");
  });

  it("sem linha da L.E., fica a que existir", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([TRES[0]]);
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas[0].descricao).toBe("L1.1/2''X1/8''");
  });

  // ⚠ a impressão foi gravada contra a linha que estava na tela naquele dia.
  it("o histórico de impressão soma TODAS as cópias da marca", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(TRES);
    const antigo = new Date("2026-09-01T10:00:00Z"), novo = new Date("2026-09-08T14:00:00Z");
    mockPrisma.auditLog.groupBy.mockResolvedValue([
      { entityId: "a", _max: { createdAt: antigo }, _count: { _all: 1 } },
      { entityId: "c", _max: { createdAt: novo }, _count: { _all: 2 } },
    ]);
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas[0].impressoes).toBe(3);
    expect(new Date(j.pecas[0].impressaEm).toISOString()).toBe(novo.toISOString());
  });

  it("o campo `ids` não vaza para a tela", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(TRES);
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas[0]).not.toHaveProperty("ids");
    expect(j.pecas[0]).not.toHaveProperty("fonte");
  });
});

// ⚠⚠ O importador da L.E. engoliu o rodapé da planilha: existe uma marca "TOTAL.:" em 4 obras, a da
// OP-89 com qte 8705. Dava para pedir 8.705 etiquetas de uma peça que não existe.
describe("a linha de TOTAL da planilha não é peça", () => {
  it.each(["TOTAL.:", "total.:", " TOTAL ", "SUBTOTAL", "SOMA"])("%s fica de fora da lista", async (m) => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([
      { id: "t", marca: m, descricao: null, qte: 8705, naLE: true, fonte: "LE_IMPORT" },
      { id: "p", marca: "T89A1", descricao: "COLUNA", qte: 1, naLE: true, fonte: "LE_IMPORT" },
    ]);
    expect(await marcas(await get("?opId=op1"))).toEqual(["T89A1"]);
  });

  it("marca que só COMEÇA parecido continua valendo", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([
      { id: "x", marca: "TOTALIZADOR-1", descricao: "", qte: 1, naLE: true, fonte: "LE_IMPORT" },
    ]);
    // "TOTALIZADOR" não é a palavra TOTAL isolada — o \b do padrão protege isso
    expect(await marcas(await get("?opId=op1"))).toEqual(["TOTALIZADOR-1"]);
  });

  it("some também quando vem da planilha importada", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([]);
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([{ marcasJson: [{ marca: "TOTAL.:", qte: 8705 }] }]);
    expect(await marcas(await get("?opId=op1"))).toEqual([]);
  });
});

// ⚠⚠ Na OP-89 as linhas importadas sob a chave "89" estão DESLOCADAS EM UMA POSIÇÃO em relação às
// sob "089": T89-AC13 tem 20 numa e 55 na outra, T89-AC14 tem 55 e 3. As duas são LE_IMPORT, então
// nenhuma regra de "escolher a linha" resolve — quem decide é a planilha, que é a L.E. em si.
describe("a quantidade vem da planilha da L.E. quando ela existe", () => {
  const linhas = [
    { id: "a", marca: "T89-AC13", descricao: "GRAMPO", qte: 20, naLE: true, fonte: "LE_IMPORT" },
    { id: "b", marca: "T89-AC13", descricao: "GRAMPO", qte: 55, naLE: true, fonte: "LE_IMPORT" },
  ];

  it("a planilha corrige a quantidade da linha escolhida", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(linhas);
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([
      { marcasJson: [{ marca: "T89-AC13", qte: 55, descricao: "GRAMPO TIPO 2" }] },
    ]);
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas[0]).toMatchObject({ marca: "T89-AC13", qte: 55, descricao: "GRAMPO TIPO 2" });
  });

  // ⚠ 4 marcas reais da OP-89 existem só no PecaConjunto — restringir à planilha as perderia.
  it("marca que não está na planilha mantém a quantidade da peça", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(
      [{ id: "c", marca: "T89C98", descricao: "L1.1/2''X1/8''", qte: 7, naLE: true, fonte: "LE_IMPORT" }]);
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([{ marcasJson: [{ marca: "OUTRA", qte: 1 }] }]);
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas[0]).toMatchObject({ marca: "T89C98", qte: 7 });
  });

  it("planilha com qte zerada ou ausente não zera a peça", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(linhas);
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([{ marcasJson: [{ marca: "T89-AC13" }] }]);
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas[0].qte).toBe(20);
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

  // ⚠ o groupBy agora é por (opId, marca): uma linha por MARCA, não por peça — a mesma marca tem
  // até três linhas na mesma obra (ver `linhaQueVale` em lib/itens-expedicao.js).
  const marcasDe = (opId, n) => Array.from({ length: n }, (_, i) => ({ opId, marca: `M${i}`, _count: { _all: 1 } }));

  it("some a obra que não tem item expedível em fonte nenhuma", async () => {
    mockPrisma.pecaConjunto.groupBy.mockResolvedValue(marcasDe("op2", 1641));
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
    mockPrisma.pecaConjunto.groupBy.mockResolvedValue(marcasDe("op1", 537));
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([{ opId: "op1", opNumero: "097", marcas: 530 }]);
    const j = await (await get()).json();
    expect(j.ops).toHaveLength(1);
    expect(j.ops[0].marcas).toBe(537);
  });

  it("pergunta ao banco só pelas peças da LE", async () => {
    mockPrisma.pecaConjunto.groupBy.mockResolvedValue([]);
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([]);
    await get();
    const chamada = mockPrisma.pecaConjunto.groupBy.mock.calls[0][0];
    expect(chamada.where).toEqual({ naLE: true });
    expect(chamada.by).toEqual(["opId", "marca"]);   // conta MARCAS, não linhas
  });
});
