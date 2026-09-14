import { beforeEach, describe, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

// A COLUNA "ETIQUETA" DA TELA MORA AQUI. Matheus (08/09/2026): "deixar uma coluna na lista no
// portal mostrando quais etiquetas já foram impressas". O histórico não é uma coluna nova de
// `PecaConjunto` — é o `AuditLog`, que já é obrigatório em toda mutação. Estes testes existem
// para essa decisão não virar um "achei que gravava" no dia em que alguém abrir a tela.

const mocks = vi.hoisted(() => ({ role: vi.fn(), pdf: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/etiqueta-carregamento-pdf", () => ({
  gerarEtiquetasCarregamentoPDF: mocks.pdf,
  // A rota valida o modelo pedido contra esta lista antes de desenhar.
  MODELOS: ["padrao", "qws"],
}));
import { GET, POST } from "@/app/api/expedicao/etiquetas/route";

const ACAO = "IMPRIMIR_ETIQUETA_CARREGAMENTO";
// ⚠ A CHAVE DO HISTÓRICO É A MARCA, não o id da peça: o id não sobrevive à reimportação da lista
// (a mesma lição de `LiberacaoProducao.pecaMarcas` no schema), e desde que a lista passou a ser
// definida pela L.E. existe item legítimo SEM linha no cadastro.
const ENTIDADE = "EtiquetaCarregamento";
const chave = (marca) => `97|${marca}`;
const PECAS = [
  { id: "p1", marca: "T97A140", descricao: "TRAVAMENTO", qte: 1, pesoUnitKg: 4.46, status: "PENDENTE", naLE: true },
  { id: "p2", marca: "T97A141", descricao: "TRAVAMENTO", qte: 3, pesoUnitKg: 4.46, status: "PENDENTE", naLE: true },
];
const get = (q = "") => GET(new Request(`http://localhost/api/expedicao/etiquetas${q}`));
const post = (body) => POST(new Request("http://localhost/api/expedicao/etiquetas",
  { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "u1", name: "Expedição" });
  mocks.pdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op1", numero: "97", cliente: "MEGASTEAM", obra: "Unipar" });
  mockPrisma.pecaConjunto.findMany.mockResolvedValue(PECAS);
  mockPrisma.auditLog.groupBy.mockResolvedValue([]);
  mockPrisma.listaExpedicao.findMany.mockResolvedValue([]);
  // ⚠ Desde 14/09/2026 o modelo PADRÃO também lê esta tabela (a TAG do cliente que sai na
  // frente da descrição). Sem mapa importado, a obra imprime exatamente como antes.
  mockPrisma.etiquetaCampoExtra.findMany.mockResolvedValue([]);
});

describe("GET — o que já saiu impresso", () => {
  it("marca sem histórico volta com impressaEm nulo, e não some da lista", async () => {
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas.map((p) => [p.marca, p.impressaEm, p.impressoes]))
      .toEqual([["T97A140", null, 0], ["T97A141", null, 0]]);
  });

  it("junta data e contagem na peça certa", async () => {
    const em = new Date("2026-09-08T14:20:00Z");
    mockPrisma.auditLog.groupBy.mockResolvedValue([
      { entityId: chave("T97A141"), _max: { createdAt: em }, _count: { _all: 2 } },
    ]);
    const j = await (await get("?opId=op1")).json();
    expect(j.pecas[0]).toMatchObject({ marca: "T97A140", impressaEm: null, impressoes: 0 });
    expect(j.pecas[1]).toMatchObject({ marca: "T97A141", impressoes: 2 });
    expect(new Date(j.pecas[1].impressaEm).toISOString()).toBe(em.toISOString());
  });

  it("consulta as chaves desta OP — as novas por marca e as antigas por id", async () => {
    await get("?opId=op1");
    const { where } = mockPrisma.auditLog.groupBy.mock.calls[0][0];
    expect(where.action).toBe(ACAO);
    expect(where.OR[0].entity).toBe(ENTIDADE);
    expect([...where.OR[0].entityId.in].sort()).toEqual([chave("T97A140"), chave("T97A141")].sort());
    // ⚠ os registros antigos foram gravados por id; sem eles a coluna diria "nunca impressa"
    expect(where.OR[1].entity).toBe("PecaConjunto");
    expect([...where.OR[1].entityId.in].sort()).toEqual(["p1", "p2"]);
  });

  it("soma a chave nova com os ids antigos da mesma marca", async () => {
    const antigo = new Date("2026-09-01T10:00:00Z"), novo = new Date("2026-09-08T14:00:00Z");
    mockPrisma.auditLog.groupBy.mockResolvedValue([
      { entityId: "p1", _max: { createdAt: antigo }, _count: { _all: 1 } },
      { entityId: chave("T97A140"), _max: { createdAt: novo }, _count: { _all: 2 } },
    ]);
    const j = await (await get("?opId=op1")).json();
    const m = j.pecas.find((p) => p.marca === "T97A140");
    expect(m.impressoes).toBe(3);
    expect(new Date(m.impressaEm).toISOString()).toBe(novo.toISOString());
  });

  it("OP sem peça nenhuma não vai ao AuditLog com uma lista vazia", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([]);
    mockPrisma.listaExpedicao.findMany.mockResolvedValue([]);
    expect((await (await get("?opId=op1")).json()).pecas).toEqual([]);
    expect(mockPrisma.auditLog.groupBy).not.toHaveBeenCalled();
  });
});

describe("POST — registrar a impressão", () => {
  it("uma linha por MARCA, com quem imprimiu e quantas etiquetas saíram", async () => {
    const r = await post({ opId: "op1", marcas: ["T97A140", "T97A141"] });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    const { data } = mockPrisma.auditLog.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ userId: "u1", action: ACAO, entity: ENTIDADE, entityId: chave("T97A140") });
    expect(data[0].diff).toMatchObject({ op: "97", marca: "T97A140", etiquetas: 1, por: "Expedição" });
    expect(data[1].diff).toMatchObject({ marca: "T97A141", etiquetas: 3 });
  });

  it("registra só as marcas escolhidas", async () => {
    await post({ opId: "op1", marcas: ["T97A141"] });
    expect(mockPrisma.auditLog.createMany.mock.calls[0][0].data.map((d) => d.entityId)).toEqual([chave("T97A141")]);
  });

  // ⚠ Carimbar antes de gerar diria "já saiu" para uma etiqueta que ninguém viu.
  it("PDF que falha não deixa rastro de impressão", async () => {
    mocks.pdf.mockRejectedValue(new Error("sem fonte"));
    expect((await post({ opId: "op1", marcas: ["T97A140"] })).status).toBe(500);
    expect(mockPrisma.auditLog.createMany).not.toHaveBeenCalled();
  });

  // ⚠ E o contrário: a auditoria não pode segurar o PDF que já existe.
  it("falha ao registrar não impede a etiqueta de sair", async () => {
    mockPrisma.auditLog.createMany.mockRejectedValue(new Error("banco fora"));
    const r = await post({ opId: "op1", marcas: ["T97A140"] });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("sem marca nenhuma não gera PDF nem registro", async () => {
    expect((await post({ opId: "op1", marcas: [] })).status).toBe(400);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("preserva as permissões de acesso", async () => {
    mocks.role.mockRejectedValue(new Error("Forbidden"));
    expect((await post({ opId: "op1", marcas: ["T97A140"] })).status).toBe(403);
    expect(mockPrisma.auditLog.createMany).not.toHaveBeenCalled();
  });
});

// ─── A TAG DO CLIENTE NA FRENTE DA DESCRIÇÃO (14/09/2026) ────────────────────
//
// ⚠⚠ ETIQUETA SEM TAG PRECISA DE UM "SIM". A obra tem mapa importado e a marca escolhida não está
// coberta: imprimir assim é legítimo (sai sem prefixo), mas tem de ser escolha de quem está com o
// rolo na mão — e não um adesivo que aparece sem destino no pátio. Achado do Codex.

const mapaDe = (linhas) => linhas.map(([marca, unidade, tagCliente]) => ({ marca, unidade, tagCliente }));

describe("POST — a cobertura das TAGs é conferida no servidor", () => {
  it("obra sem mapa importado imprime como sempre", async () => {
    const r = await post({ opId: "op1", marcas: ["T97A140"] });
    expect(r.status).toBe(200);
  });

  it("marca coberta por inteiro imprime sem perguntar, e a peça leva o mapa", async () => {
    mockPrisma.etiquetaCampoExtra.findMany.mockResolvedValue(mapaDe([["T97A140", 1, "TC 4706"]]));
    const r = await post({ opId: "op1", marcas: ["T97A140"] });
    expect(r.status).toBe(200);
    const [{ pecas }] = mocks.pdf.mock.calls[0];
    expect(pecas[0].tagsUnidade.get(1)).toBe("TC 4706");
  });

  // ⚠⚠ A conferência é sobre o que foi ESCOLHIDO: a T97A141 tem 3 peças e o mapa cobre uma.
  it("marca com peça descoberta é RECUSADA com 409, e nada é desenhado", async () => {
    mockPrisma.etiquetaCampoExtra.findMany.mockResolvedValue(mapaDe([["T97A141", 1, "TC 4706"]]));
    const r = await post({ opId: "op1", marcas: ["T97A141"] });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.precisaConfirmar).toBe(true);
    expect(j.error).toContain("2 etiqueta(s) sairão SEM TAG");
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it("com o 'sim' explícito, imprime — e as descobertas saem sem prefixo", async () => {
    mockPrisma.etiquetaCampoExtra.findMany.mockResolvedValue(mapaDe([["T97A141", 1, "TC 4706"]]));
    const r = await post({ opId: "op1", marcas: ["T97A141"], confirmarSemTag: true });
    expect(r.status).toBe(200);
    const [{ pecas }] = mocks.pdf.mock.calls[0];
    expect(pecas[0].tagsUnidade.get(1)).toBe("TC 4706");
    expect(pecas[0].tagsUnidade.get(2)).toBeUndefined();
  });

  // ⚠ O mapa é da obra inteira; a pergunta é só das marcas do lote. Escolher a marca coberta não
  // pode ser barrado porque OUTRA marca da obra está descoberta.
  it("a marca descoberta não barra a impressão de outra que está coberta", async () => {
    mockPrisma.etiquetaCampoExtra.findMany.mockResolvedValue(mapaDe([["T97A140", 1, "TC 4706"]]));
    expect((await post({ opId: "op1", marcas: ["T97A140"] })).status).toBe(200);
  });
});

// ⚠⚠ A COBERTURA CONFERIDA NA IMPRESSÃO É A DO LOTE, NÃO A DA OBRA — e este teste é o que impede a
// pergunta de aparecer sempre. O mapa tem as 96 marcas da OP e a impressão costuma ser de uma:
// comparando o mapa inteiro contra a seleção, toda impressão parcial acusaria 95 marcas "fora da
// lista". Confirmação que sempre aparece é confirmação que ninguém lê.
describe("POST — a pergunta é sobre o lote, não sobre a obra", () => {
  it("imprimir UMA marca coberta não é barrado pelas outras marcas do mapa", async () => {
    mockPrisma.etiquetaCampoExtra.findMany.mockResolvedValue(mapaDe([
      ["T97A140", 1, "TC 4706"],
      ["T97A141", 1, "TC 4707"], ["T97A141", 2, "TC 4707"], ["T97A141", 3, "TC 4707"],
      ["MARCA-DE-OUTRO-LOTE", 1, "TC 4708"],
    ]));
    const r = await post({ opId: "op1", marcas: ["T97A140"] });
    expect(r.status).toBe(200);
  });

  it("e o lote inteiro coberto também passa direto", async () => {
    mockPrisma.etiquetaCampoExtra.findMany.mockResolvedValue(mapaDe([
      ["T97A140", 1, "TC 4706"],
      ["T97A141", 1, "TC 4707"], ["T97A141", 2, "TC 4707"], ["T97A141", 3, "TC 4707"],
      ["MARCA-DE-OUTRO-LOTE", 1, "TC 4708"],
    ]));
    expect((await post({ opId: "op1", marcas: ["T97A140", "T97A141"] })).status).toBe(200);
  });
});

// ⚠⚠ O TETO POR IMPRESSÃO (14/09/2026). Marcar tudo na OP-067 são 60.281 etiquetas: ~12 minutos de
// função e ~113 MB. A recusa tem de vir ANTES de gerar — e o carimbo de impressão, DEPOIS de saber
// que o arquivo cabe, senão o portal registra como impressa uma etiqueta que ninguém recebeu.
describe("POST — o teto de tamanho", () => {
  it("seleção acima do limite é recusada com 413, sem desenhar nada", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(
      [{ id: "g", marca: "GIGANTE", descricao: "X", qte: 9999, pesoUnitKg: 1, naLE: true }]);
    const r = await post({ opId: "op1", marcas: ["GIGANTE"] });
    expect(r.status).toBe(413);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("a recusa diz quantas foram pedidas e qual o limite", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(
      [{ id: "g", marca: "GIGANTE", descricao: "X", qte: 9999, pesoUnitKg: 1, naLE: true }]);
    const j = await (await post({ opId: "op1", marcas: ["GIGANTE"] })).json();
    expect(j.etiquetas).toBe(9999);
    expect(j.limite).toBe(2000);
  });

  // ⚠⚠ PDF PESADO DEMAIS NÃO PODE VIRAR HISTÓRICO. A plataforma recusaria a resposta; carimbando
  // antes, a coluna "Etiqueta" passaria a dizer "já saiu" para um adesivo que ninguém viu.
  it("PDF acima do limite de bytes é recusado e NÃO vira histórico", async () => {
    mocks.pdf.mockResolvedValue(new Uint8Array(5_000_000));
    const r = await post({ opId: "op1", marcas: ["T97A140"] });
    expect(r.status).toBe(413);
    expect((await r.json()).bytes).toBe(5_000_000);
    expect(mockPrisma.auditLog.createMany).not.toHaveBeenCalled();
  });

  // ⚠ A caixa tira a seleção do limite: 9.999 peças numa caixa são UMA etiqueta.
  it("marca em caixa passa, mesmo com milhares de peças", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue(
      [{ id: "g", marca: "GIGANTE", descricao: "X", qte: 9999, pesoUnitKg: 1, naLE: true }]);
    const r = await post({ opId: "op1", marcas: ["GIGANTE"], emCaixa: ["GIGANTE"] });
    expect(r.status).toBe(200);
  });
});
