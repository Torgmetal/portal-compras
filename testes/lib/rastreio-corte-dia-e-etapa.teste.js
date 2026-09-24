// Vitor (24/09/2026): "temos mais materiais, sem R no data book da OP-102". Dois defeitos do motor de
// rastreio, reproduzidos com os dados da OP-102:
// 1. o corte feito NO DIA em que o aço chegou caía em "cortada antes da entrega" — a hora do CMR
//    (meio-dia UTC) e a da ordem do Syneco (meia-noite de Brasília) nunca foram dado;
// 2. o ferro redondo nunca teve o corte apontado, mas os conjuntos onde ele entra já estavam
//    montados e soldados — e o data book dizia "aguarda corte" sobre peça pintada.
import { it, expect, vi, beforeEach, describe } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { rastreioDaOp } from "@/lib/rastreio-peca";

const CMR = [
  { importRef: "261136", nome: "BARRA REDONDA ACO CARBONO LAMINADA A-36 D. 3/4POL", numeroCorrida: "K509000", numeroDocumento: "c1", norma: "A36", fornecedor: "X", pedidoCompra: null, nfNumero: null, dataRecebimento: new Date("2026-08-11T12:00:00Z"), pesoKg: 135 },
  { importRef: "261153", nome: "PERFIL H ACO CARBONO LAMINADO A 572 GR.50 DN. W200 X 35,9KG/M", numeroCorrida: "2816097232", numeroDocumento: "c2", norma: "A572", fornecedor: "X", pedidoCompra: null, nfNumero: null, dataRecebimento: new Date("2026-08-13T12:00:00Z"), pesoKg: 431 },
];
const peca = (marca, perfil, extra = {}) => ({ marca, perfil, qte: 1, pesoTotalKg: 20, pesoUnitKg: 20, tipoPeca: "CROQUI", fonte: "LPC_IMPORT", corteConcluidoEm: null, dataProducao: null, material: "A36", descricao: "CHAPA", ...extra });
let corte = [], etapas = [];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.documentoQualidade.findMany.mockResolvedValue(CMR);
  mockPrisma.trocaRastreabilidade.findMany.mockResolvedValue([]);
  mockPrisma.conjuntoCroqui.findMany.mockResolvedValue([{ croqui: { marca: "T102A-P3" }, conjunto: { marca: "T102A1" } }]);
  // 1ª consulta: corte/preparação (OR); 2ª: etapas seguintes (NOT), só das marcas pedidas
  mockPrisma.mesOrdem.findMany.mockImplementation(async ({ where }) => (where.NOT ? etapas.filter((o) => where.item.in.includes(o.item)) : corte));
  corte = []; etapas = [];
});

describe("corte no dia do recebimento", () => {
  it("cortada no mesmo dia em que o aço chegou ganha o R — o dia é a regra, a hora nunca foi dado", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca("T102A-P61", "W200X35.9")]);
    corte = [{ item: "T102A-P61", dataInicio: new Date("2026-08-13T03:00:00Z") }]; // 00:00 de Brasília
    const r = await rastreioDaOp("102", "op102");
    const p = r.porMarca.get("T102A-P61");
    expect(p.situacao).toBe("R_DEFINIDO");
    expect(p.usadas[0].rastreio).toBe("261153");
    expect(p.corteInferido).toBeUndefined();
  });

  it("cortada no dia ANTERIOR ao recebimento continua sem R — a regra não afrouxou", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca("T102A-P57", "W200X35.9")]);
    corte = [{ item: "T102A-P57", dataInicio: new Date("2026-08-12T03:00:00Z") }];
    const r = await rastreioDaOp("102", "op102");
    expect(r.porMarca.get("T102A-P57").situacao).toBe("ESTOQUE");
  });
});

describe("corte provado pela etapa seguinte", () => {
  it("croqui sem corte apontado, dentro de conjunto já montado: foi cortado até a montagem e ganha o R", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca("T102A-P3", 'FRØ3/4"', { descricao: "FERRO REDONDO" })]);
    etapas = [{ item: "T102A1", dataInicio: new Date("2026-08-21T03:00:00Z") }, { item: "T102A1", dataInicio: new Date("2026-08-17T03:00:00Z") }];
    const r = await rastreioDaOp("102", "op102");
    const p = r.porMarca.get("T102A-P3");
    expect(p.situacao).toBe("R_DEFINIDO");
    expect(p.usadas[0].rastreio).toBe("261136");
    expect(p.cortadoEm).toBe("2026-08-17"); // o PRIMEIRO dia com etapa seguinte
    expect(p.corteInferido).toBe(true);
  });

  it("o teto também limita o FIFO: aço que chegou depois da montagem não entra", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca("T102A-P3", 'FRØ3/4"')]);
    etapas = [{ item: "T102A1", dataInicio: new Date("2026-08-10T03:00:00Z") }]; // montado antes de a barra chegar (11/08)
    const r = await rastreioDaOp("102", "op102");
    expect(r.porMarca.get("T102A-P3").situacao).toBe("ESTOQUE");
  });

  it("sem apontamento nenhum à frente continua aguardando corte", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca("T102A-P3", 'FRØ3/4"')]);
    const r = await rastreioDaOp("102", "op102");
    expect(r.porMarca.get("T102A-P3").situacao).toBe("AGUARDANDO_CORTE");
  });

  it("a data própria de corte manda — a etapa seguinte só entra quando ela falta", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([peca("T102A-P3", 'FRØ3/4"', { corteConcluidoEm: new Date("2026-08-12T15:00:00Z") })]);
    etapas = [{ item: "T102A1", dataInicio: new Date("2026-08-17T03:00:00Z") }];
    const r = await rastreioDaOp("102", "op102");
    const p = r.porMarca.get("T102A-P3");
    expect(p.cortadoEm).toBe("2026-08-12");
    expect(p.corteInferido).toBeUndefined();
    expect(mockPrisma.conjuntoCroqui.findMany).not.toHaveBeenCalled(); // nem consulta quando não precisa
  });
});
