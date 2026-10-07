// A busca dos certificados do CMR para os recebimentos e a criação do relatório a partir deles
// (Vitor, 07/10/2026: "selecionar apenas os certificados", sem peças).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Geraldo" }) }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn().mockResolvedValue({}), proximoNumero: vi.fn().mockResolvedValue(1) }));
vi.mock("@/lib/importar-procedimentos", () => ({ procedimentoDoTipo: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/relatorio-dimensional", () => ({ procedimentoTolerancia: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/planos-aceite", () => ({ dadosDaObra: vi.fn().mockResolvedValue({ pedidoCliente: "4600123456" }) }));
import { GET as buscar } from "@/app/api/qualidade/inspecoes/certificados/route";
import { POST as criar } from "@/app/api/qualidade/inspecoes/dimensional/route";

const doc = (id, nome, extra = {}) => ({
  id, nome, importRef: `R${id}`, fornecedor: "TECHNO", nfNumero: "73832", pedidoCompra: "835", numeroDocumento: `C-${id}`,
  numeroCorrida: `L-${id}`, quantidade: 0, pesoKg: 500, dataValidade: null, dataRecebimento: new Date("2026-09-01T00:00:00Z"),
  opNumero: null, arquivoUrl: "https://x/c.pdf", sharepointUrl: null, norma: null, ...extra,
});
const CMR = [
  doc("1", "CHAPA ACO 9,50", { opNumero: "102" }),
  doc("2", "ARAME TUBULAR K-71T - 1,20MM"),
  doc("3", "ELETRODO 6013 3,25", { dataRecebimento: new Date("2026-09-24T00:00:00Z") }),
  doc("4", "REVELADOR DE TRINCAS METALCHECK D-70", { pesoKg: null, quantidade: 5 }),
  doc("5", "TINTA INDUSTHANE RHB 650 CINZA MN 6,5", { pesoKg: null, quantidade: 36, numeroCorrida: "85596", dataValidade: new Date("2027-03-01T00:00:00Z") }),
  doc("6", "ENDURECEDOR PARA INDUSTHANE 35.010", { pesoKg: null, quantidade: 9, numeroCorrida: "85597" }),
  doc("7", "DILUENTE PARA INDUSTHANE ACR 34.019", { pesoKg: null, quantidade: 4, numeroCorrida: "85598" }),
];
const get = (qs) => buscar(new Request(`http://localhost/api/qualidade/inspecoes/certificados?${qs}`));
const post = (body) => criar(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.documentoQualidade.findMany.mockImplementation(async ({ where }) =>
    CMR.filter((d) => !where.id?.in || where.id.in.includes(d.id)));
  mockPrisma.oP.findFirst.mockResolvedValue({ id: "op102", escopoQualidade: null });
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([]);
  mockPrisma.padraoInspecao.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.relatorioInspecao.create.mockImplementation(async ({ data }) => ({ id: "r", ...data }));
});

describe("buscar certificados no CMR", () => {
  it("sem texto, lista só os da classe (arame: arame e eletrodo), o mais recente primeiro", async () => {
    const r = await get("tipo=RECEBIMENTO_ARAME&opNumero=102");
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.certificados.map((c) => c.docId)).toEqual(["3", "2"]);
    expect(j.certificados[0]).toMatchObject({ r: "R3", certificado: "C-3", lote: "L-3", nf: "73832", pc: "835", quantidade: "500 kg" });
  });

  it("filtra no CMR (origens do CMR, só ativos) e com texto busca em todo o CMR", async () => {
    await get("tipo=RECEBIMENTO_PENETRANTE&q=d-70");
    const where = mockPrisma.documentoQualidade.findMany.mock.calls[0][0].where;
    expect(where.categoria).toBe("MATERIAL");
    expect(where.origem.in).toContain("registro_manual");
    expect(where.ativo).toBe(true);
    expect(JSON.stringify(where.OR)).toMatch(/d-70/);
  });

  it("com texto, o que não é da classe também aparece (penetrante e removedor não estão no CMR)", async () => {
    const j = await (await get("tipo=RECEBIMENTO_PENETRANTE&q=chapa")).json();
    expect(j.certificados.map((c) => c.docId)).toContain("1");
  });

  it("tipo que não é recebimento é recusado", async () => {
    expect((await get("tipo=PINTURA")).status).toBe(400);
  });
});

describe("criar o recebimento pelos certificados", () => {
  it("arame: uma linha por certificado, na ordem escolhida, sem peças e com as marcas em branco", async () => {
    const r = await post({ opNumero: "102", tipo: "RECEBIMENTO_ARAME", marcas: ["T102A1"], certificados: ["3", "2"] });
    expect(r.status).toBe(200);
    const { relatorio } = await r.json();
    expect(relatorio.marcas).toEqual([]);
    expect(relatorio.codigo).toBe("RRA-102-001");
    expect(relatorio.resultados.itens.map((i) => i.r)).toEqual(["R3", "R2"]);
    expect(relatorio.resultados.itens[0]).toMatchObject({ docId: "3", certificado: "C-3", visual: null, dimensional: null, documentos: null });
    expect(relatorio.resultados.contrato).toBe("4600123456");
  });

  it("tintas: os certificados preenchem os lotes A/B/C, com a quantidade do CMR", async () => {
    const r = await post({ opNumero: "102", tipo: "RECEBIMENTO_TINTA", certificados: ["7", "5", "6"] });
    expect(r.status).toBe(200);
    const res = (await r.json()).relatorio.resultados;
    expect(res.lotes.map((l) => l.lote)).toEqual(["85596", "85597", "85598"]);
    expect(res.lotes.map((l) => l.quantidade)).toEqual(["36", "9", "4"]);
    expect(res.lotes[0].validade).toBe("2027-03-01");
    expect(res.material).toBe("TINTA INDUSTHANE RHB 650");
    expect(res.certificados.map((c) => c.r)).toEqual(["R7", "R5", "R6"]);
  });

  it("tintas com mais de três certificados é recusado, dizendo por quê", async () => {
    const r = await post({ opNumero: "102", tipo: "RECEBIMENTO_TINTA", certificados: ["5", "6", "7", "4"] });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/A, B e C/);
  });

  it("certificado que não está (ou não está mais) no CMR é recusado", async () => {
    const r = await post({ opNumero: "102", tipo: "RECEBIMENTO_ARAME", certificados: ["999"] });
    expect(r.status).toBe(400);
    expect(mockPrisma.relatorioInspecao.create).not.toHaveBeenCalled();
  });

  it("sem certificado o relatório nasce vazio (o item pode ser incluído à mão)", async () => {
    const r = await post({ opNumero: "102", tipo: "RECEBIMENTO_PENETRANTE", certificados: [] });
    expect(r.status).toBe(200);
    expect((await r.json()).relatorio.resultados.itens).toEqual([]);
  });

  it("a auditoria registra quais certificados (pelo R)", async () => {
    await post({ opNumero: "102", tipo: "RECEBIMENTO_ARAME", certificados: ["2"] });
    expect(mockPrisma.auditLog.create.mock.calls.at(-1)[0].data.diff.certificados).toEqual(["R2"]);
  });
});
