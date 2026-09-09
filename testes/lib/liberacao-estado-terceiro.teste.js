import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/fora-da-fabrica", () => ({ pecasNoTerceiro: vi.fn() }));
vi.mock("@/lib/produzido-setor", () => ({ lerProduzidoPorSetor: vi.fn() }));

const { pecasNoTerceiro } = await import("@/lib/fora-da-fabrica");
const { lerProduzidoPorSetor } = await import("@/lib/produzido-setor");
const { estadoDasLiberacoes } = await import("@/lib/liberacao-estado");

// 3 peças da mesma liberação de corte: uma no terceiro, uma sem dia, uma já agendada.
const PECAS = [
  { id: "p1", opId: "o1", marca: "T97B1", qte: 1, corteDiaProgramado: null, maquina: null },
  { id: "p2", opId: "o1", marca: "T97A2", qte: 1, corteDiaProgramado: null, maquina: null },
  { id: "p3", opId: "o1", marca: "T97A3", qte: 1, corteDiaProgramado: new Date("2026-09-10"), maquina: "LASER_CHAPA" },
];
const LIB = [{ id: "l1", setores: ["CORTE"], pecaIds: ["p1", "p2", "p3"] }];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.pecaConjunto.findMany.mockResolvedValue(PECAS);
  lerProduzidoPorSetor.mockResolvedValue(() => 0); // nada produzido
});

describe("peça no terceiro sai da fila de agendamento", () => {
  it("a liberação da OP-097 com as 260 no terceiro não cobra dia de ninguém", async () => {
    pecasNoTerceiro.mockResolvedValue(new Set(["p1", "p2", "p3"]));
    const e = (await estadoDasLiberacoes(LIB)).get("l1");
    expect(e.semDia).toBe(0);
    expect(e.total).toBe(0);
    expect(e.noTerceiro).toBe(3);
    // não é órfã: as peças existem, só não são nossas de fazer
    expect(e.orfa).toBe(false);
  });

  it("com uma no terceiro, o aviso cobra só a que ficou aqui sem dia", async () => {
    pecasNoTerceiro.mockResolvedValue(new Set(["p1"]));
    const e = (await estadoDasLiberacoes(LIB)).get("l1");
    expect(e.noTerceiro).toBe(1);
    expect(e.total).toBe(2);
    expect(e.semDia).toBe(1); // só a p2 — a p3 já tem dia
  });

  it("sem terceiro nenhum, o comportamento de antes se mantém", async () => {
    pecasNoTerceiro.mockResolvedValue(new Set());
    const e = (await estadoDasLiberacoes(LIB)).get("l1");
    expect(e.noTerceiro).toBe(0);
    expect(e.total).toBe(3);
    expect(e.semDia).toBe(2);
    expect(e.semPosto).toBe(0);
  });

  it("peça no terceiro também não conta como 'ainda por produzir' no histórico", async () => {
    pecasNoTerceiro.mockResolvedValue(new Set(["p1", "p2"]));
    const e = (await estadoDasLiberacoes(LIB)).get("l1");
    expect(e.naoFeitas).toBe(1); // só a p3
  });
});

describe("órfã continua sendo órfã", () => {
  it("id que não resolve peça nenhuma não vira 'no terceiro'", async () => {
    pecasNoTerceiro.mockResolvedValue(new Set());
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([]);
    const e = (await estadoDasLiberacoes([{ id: "l2", setores: ["CORTE"], pecaIds: ["x1", "x2"] }])).get("l2");
    expect(e.orfa).toBe(true);
    expect(e.noTerceiro).toBe(0);
  });
});
