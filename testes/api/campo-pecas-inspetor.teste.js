import { it, expect, vi, beforeEach, describe } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u" }) }));
import { GET } from "@/app/api/campo/pecas/route";

// A OP-089 como está no banco (14/09/2026): LPC em duas frentes (T89A, T89C) com conjunto, croqui
// e peça avulsa; LE ("089") com os mesmos conjuntos, os parafusos (T89-AC1…) e a grade comprada.
const LPC = (opNumero, marca, tipoPeca, extra = {}) => ({ opNumero, marca, tipoPeca, fonte: "LPC_IMPORT", qte: 1, perfil: "W200X15", descricao: "W200X15", pesoUnitKg: 12, ...extra });
const LE = (marca, descricao, extra = {}) => ({ opNumero: "089", marca, tipoPeca: null, fonte: "LE_IMPORT", qte: 1, perfil: null, descricao, pesoUnitKg: 100, ...extra });
const BANCO = [
  LPC("T89A", "T89A1", "CONJUNTO"), LE("T89A1", "COLUNA"),
  LPC("T89A", "T89A-P1", "CROQUI"),
  LPC("T89A", "T89A18", null, { perfil: "L2''X1/8''" }), LE("T89A18", "CONTRAVENTAMENTO"),
  LPC("T89C", "T89C1", "CONJUNTO"), LE("T89C1", "VIGA"),
  LPC("T89C", "T89C-P10", "CROQUI"),
  LE("T89-AC1", "PARAFUSO SEXT. A325", { pesoUnitKg: 0 }),
  LE("T89AG1", "GRADE DE PISO", { pesoUnitKg: 30 }),
];

const chamar = async (qs) => (await GET(new Request(`http://localhost?opId=op&${qs}`))).json();

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findUnique.mockResolvedValue({ numero: "089" });
  mockPrisma.pecaConjunto.findMany.mockImplementation(async ({ where }) => {
    if (where.tipoPeca === "CONJUNTO") return BANCO.filter((p) => p.tipoPeca === "CONJUNTO");
    if (where.OR) return BANCO.filter((p) => p.tipoPeca !== "CROQUI");
    return BANCO;
  });
});

describe("a tela do inspetor", () => {
  it("todas=1 traz conjunto e peça avulsa, sem croqui nem acessório", async () => {
    const j = await chamar("todas=1");
    expect(j.pecas.map((p) => p.marca)).toEqual(["T89A1", "T89A18", "T89C1"]);
  });
  it("tira parafuso com hífen (T89-AC1) e grade comprada (T89AG1) mesmo quando o banco os devolve", async () => {
    const j = await chamar("todas=1&croquis=1");
    expect(j.pecas.map((p) => p.marca)).not.toContain("T89-AC1");
    expect(j.pecas.map((p) => p.marca)).not.toContain("T89AG1");
  });
  it("croqui só entra com croquis=1 (dimensional de peças avulsas)", async () => {
    const j = await chamar("todas=1&croquis=1");
    expect(j.pecas.map((p) => p.marca)).toEqual(["T89A1", "T89A18", "T89A-P1", "T89C1", "T89C-P10"]);
  });
  it("sem todas=1 continua só conjunto", async () => {
    const j = await chamar("");
    expect(j.pecas.map((p) => p.marca)).toEqual(["T89A1", "T89C1"]);
  });
});

describe("as fases", () => {
  it("cada peça sai com a fase da frente da LPC e a resposta lista as fases da obra", async () => {
    const j = await chamar("todas=1");
    expect(j.fases).toEqual(["A", "C"]);
    expect(Object.fromEntries(j.pecas.map((p) => [p.marca, p.fase]))).toEqual({ T89A1: "A", T89A18: "A", T89C1: "C" });
  });
  it("fase=C filtra antes do corte de 60 e mantém a lista de fases", async () => {
    const j = await chamar("todas=1&fase=C");
    expect(j.pecas.map((p) => p.marca)).toEqual(["T89C1"]);
    expect(j.fases).toEqual(["A", "C"]);
  });
  it("sem letra na chave da LPC, a fase vem da marca", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([LPC("097", "T97B4", "CONJUNTO"), LPC("097", "T97A9", "CONJUNTO")]);
    mockPrisma.oP.findUnique.mockResolvedValue({ numero: "097" });
    const j = await chamar("todas=1");
    expect(j.pecas.map((p) => `${p.marca}:${p.fase}`)).toEqual(["T97A9:A", "T97B4:B"]);
  });
});

describe("a quantidade", () => {
  it("não soma LPC com LE da mesma marca — a LE manda", async () => {
    const j = await chamar("todas=1");
    expect(j.pecas.find((p) => p.marca === "T89A1").quantidade).toBe(1);
  });
  it("soma a mesma marca em frentes diferentes da LPC quando não há LE", async () => {
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([LPC("T67A", "T67A1", "CONJUNTO", { qte: 4 }), LPC("T67B", "T67A1", "CONJUNTO", { qte: 6 })]);
    const j = await chamar("todas=1");
    expect(j.pecas[0].quantidade).toBe(10);
  });
});
