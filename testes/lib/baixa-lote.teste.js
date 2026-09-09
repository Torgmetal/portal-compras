import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/produzido-setor", () => ({ lerProduzidoPorSetor: vi.fn() }));

const { lerProduzidoPorSetor } = await import("@/lib/produzido-setor");
const { pendenciasDaOp, alvoDoLote, baixarSetorEmLote, SETORES_BAIXA_LOTE } = await import("@/lib/baixa-lote");

/* Vitor (09/09/2026): "não é possível não ter uma maneira de darmos baixa de uma vez". A OP-102 na
   montagem: três conjuntos, 719 kg, nenhum com bancada — o caso que abriu isto. */
const PECAS = [
  { id: "b9",  opId: "o102", marca: "T102B9",  descricao: "SE-013", qte: 1, pesoTotalKg: 46,  tipoPeca: "CONJUNTO" },
  { id: "b11", opId: "o102", marca: "T102B11", descricao: "SE-019", qte: 1, pesoTotalKg: 377, tipoPeca: "CONJUNTO" },
  { id: "b36", opId: "o102", marca: "T102B36", descricao: "SE-025", qte: 1, pesoTotalKg: 296, tipoPeca: "CONJUNTO" },
  { id: "a20", opId: "o102", marca: "T102A20", descricao: "VIGA",   qte: 4, pesoTotalKg: 400, tipoPeca: "CONJUNTO" },
  { id: "ac1", opId: "o102", marca: "T102-AC1", descricao: "PARAFUSO SEXT. A325", qte: 100, pesoTotalKg: 0, tipoPeca: null },
  // croqui: só corte. Conjunto composto: só da montagem em diante.
  { id: "p1",  opId: "o102", marca: "T102A-P1", descricao: "W200X52", qte: 2, pesoTotalKg: 354, tipoPeca: "CROQUI" },
].map((p) => (p.tipoPeca === "CONJUNTO" ? { ...p, _count: { conjuntoCroquis: 3 } } : p));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.pecaConjunto.findMany.mockResolvedValue(PECAS);
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "o102", numero: "102" });
  mockPrisma.$executeRaw.mockResolvedValue(3);
  // montagem: a A20 tem 3 de 4 feitas; as B estão zeradas. Pintura: tudo zerado.
  lerProduzidoPorSetor.mockResolvedValue((p, setor) => (setor === "MONTAGEM" && p.marca === "T102A20" ? 3 : 0));
});

describe("o que falta por setor", () => {
  it("conta só o saldo, peça a peça, e ignora item comprado", async () => {
    const r = await pendenciasDaOp("o102");
    const m = r.porSetor.MONTAGEM;
    expect(m.itens.map((i) => i.marca)).toEqual(["T102B9", "T102B11", "T102B36", "T102A20"]);
    // o croqui não aparece na montagem; e o conjunto composto não aparece no corte
    expect(m.itens.some((i) => i.marca === "T102A-P1")).toBe(false);
    expect(r.porSetor.CORTE.itens.map((i) => i.marca)).toEqual(["T102A-P1"]);
    expect(m.pecas).toBe(1 + 1 + 1 + 1);          // a A20 falta 1 de 4
    expect(m.kg).toBe(46 + 377 + 296 + 100);      // 100 = 400 kg × 1/4
    expect(r.totalPecas).toBe(5);                 // o parafuso não é fabricação; o croqui é
    expect(m.itens.find((i) => i.marca === "T102A20")).toMatchObject({ feito: 3, falta: 1 });
  });

  it("peça com tudo feito não aparece", async () => {
    lerProduzidoPorSetor.mockResolvedValue(() => 99);
    const r = await pendenciasDaOp("o102");
    for (const s of SETORES_BAIXA_LOTE) expect(r.porSetor[s].pecas).toBe(0);
  });
});

describe("o alvo do lote", () => {
  it("baixa vai na quantidade PLANEJADA, não no saldo — o maior fecha a peça sem contar duas vezes", async () => {
    const r = await pendenciasDaOp("o102");
    const alvo = alvoDoLote(r, "MONTAGEM");
    expect(alvo.find((a) => a.id === "a20").qtd).toBe(4);
    expect(alvo).toHaveLength(4);
  });

  it("setor sem pendência devolve lista vazia, e setor desconhecido também", async () => {
    lerProduzidoPorSetor.mockResolvedValue(() => 99);
    const r = await pendenciasDaOp("o102");
    expect(alvoDoLote(r, "PINTURA")).toEqual([]);
    expect(alvoDoLote(r, "EXPEDICAO")).toEqual([]);
  });
});

describe("dar baixa em lote", () => {
  it("um UPDATE só, com lote:true e motivo, e um AuditLog por setor", async () => {
    const r = await baixarSetorEmLote({ opId: "o102", setor: "MONTAGEM", user: { id: "u1", name: "Vitor" }, motivo: "conferido no pátio" });
    expect(r).toMatchObject({ pecas: 4, kg: 819 });
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    const log = mockPrisma.auditLog.create.mock.calls.at(-1)[0].data;
    expect(log).toMatchObject({ action: "BAIXA_LOTE_SETOR", entity: "OP", entityId: "o102", userId: "u1" });
    expect(log.diff).toMatchObject({ opNumero: "102", setor: "MONTAGEM", marcas: 4, motivo: "conferido no pátio" });
  });

  it("sem pendência não escreve nada", async () => {
    lerProduzidoPorSetor.mockResolvedValue(() => 99);
    const r = await baixarSetorEmLote({ opId: "o102", setor: "PINTURA", user: { id: "u1" }, motivo: "x" });
    expect(r).toEqual({ atualizados: 0, pecas: 0, kg: 0 });
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("recusa setor fora da rota e OP inexistente", async () => {
    await expect(baixarSetorEmLote({ opId: "o102", setor: "EXPEDICAO", user: { id: "u1" }, motivo: "x" })).rejects.toThrow(/Setor inválido/);
    mockPrisma.oP.findUnique.mockResolvedValue(null);
    await expect(baixarSetorEmLote({ opId: "zz", setor: "SOLDA", user: { id: "u1" }, motivo: "x" })).rejects.toThrow(/OP não encontrada/);
  });

  it("falha no AuditLog não desfaz a baixa", async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error("log fora"));
    const r = await baixarSetorEmLote({ opId: "o102", setor: "SOLDA", user: { id: "u1" }, motivo: "conferido" });
    expect(r.pecas).toBe(1 + 1 + 1 + 4);
  });
});
