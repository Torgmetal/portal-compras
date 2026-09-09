import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
const { lerProduzidoPorSetor } = await import("@/lib/produzido-setor");

const P = { opId: "o1", marca: "T67F1" };
const ordem = (setor, produzidoUn) => ({ opId: "o1", item: "T67F1", setor, produzidoUn });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([]);
  mockPrisma.romaneioItem.findMany.mockResolvedValue([]);
});

describe("apontamento na frente dá baixa atrás", () => {
  it("peça jateada conta como montada e soldada, mesmo sem registro", async () => {
    // o caso da OP-067: 447 jateadas com só 295 soldadas — impossível sem furo
    mockPrisma.mesOrdem.findMany.mockResolvedValue([
      ordem("Montagem", 0), ordem("Solda", 0), ordem("Jato", 3),
    ]);
    const feito = await lerProduzidoPorSetor([P]);
    expect(feito(P, "MONTAGEM")).toBe(3);
    expect(feito(P, "SOLDA")).toBe(3);
    expect(feito(P, "JATO")).toBe(3);
  });

  it("não empurra para a frente: pintura não herda do jato", async () => {
    mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem("Jato", 5), ordem("Pintura", 0)]);
    const feito = await lerProduzidoPorSetor([P]);
    expect(feito(P, "JATO")).toBe(5);
    expect(feito(P, "PINTURA")).toBe(0);
  });

  it("vale o maior: 4 soldadas com 2 jateadas continuam 4 na solda", async () => {
    mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem("Solda", 4), ordem("Jato", 2)]);
    const feito = await lerProduzidoPorSetor([P]);
    expect(feito(P, "SOLDA")).toBe(4);
  });

  it("a rota inteira é consultada mesmo quando o chamador pede um setor só", async () => {
    mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem("Montagem", 0), ordem("Pintura", 7)]);
    const feito = await lerProduzidoPorSetor([P], ["MONTAGEM"]);
    expect(feito(P, "MONTAGEM")).toBe(7);
    // sem pedir a rota toda no where, a pintura não viria e a montagem seguiria em 0
    const where = mockPrisma.mesOrdem.findMany.mock.calls.at(-1)[0].where;
    expect(where.setor.in).toContain("Pintura");
  });

  it("a ordem da rota é Corte → Preparação → Montagem → Solda → Acabamento → Jato → Pintura", async () => {
    mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem("Acabamento", 2)]);
    const feito = await lerProduzidoPorSetor([P]);
    for (const s of ["CORTE", "PREPARACAO", "MONTAGEM", "SOLDA", "ACABAMENTO"]) expect(feito(P, s)).toBe(2);
    for (const s of ["JATO", "PINTURA"]) expect(feito(P, s)).toBe(0);
  });
});

describe("quem precisa do cru pede o cru", () => {
  it("deduzirRota:false devolve só o que foi apontado — é o que a planilha de Baixa Syneco usa", async () => {
    mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem("Montagem", 0), ordem("Jato", 3)]);
    const feito = await lerProduzidoPorSetor([P], ["MONTAGEM"], { deduzirRota: false });
    expect(feito(P, "MONTAGEM")).toBe(0);
    // e aí a consulta não precisa da rota inteira
    const where = mockPrisma.mesOrdem.findMany.mock.calls.at(-1)[0].where;
    expect(where.setor.in).toEqual(["Montagem"]);
  });
});

describe("a baixa manual do portal continua valendo", () => {
  it("baixa do portal ganha do Syneco zerado, e ainda propaga para trás", async () => {
    mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem("Montagem", 0), ordem("Solda", 0)]);
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([
      { opId: "o1", marca: "T67F1", baixaSetores: { SOLDA: { qtd: 6 } } },
    ]);
    const feito = await lerProduzidoPorSetor([P]);
    expect(feito(P, "SOLDA")).toBe(6);
    expect(feito(P, "MONTAGEM")).toBe(6);
  });
});

/* ⚠⚠ O ROMANEIO É A ÚLTIMA ETAPA. Vitor (09/09/2026), sobre a OP-104: "deve ter algum furo de
   apontamento, não temos mais montagem dela". Os seis guarda-corpos (9 peças) não têm apontamento
   em setor NENHUM — a dedução pela rota não os alcançava, porque não havia nada à frente. Mas as
   nove embarcaram no R02 em 14/08, quantidade completa. */
describe("peça expedida dá baixa na rota inteira", () => {
  const comRomaneio = (qtd) => {
    mockPrisma.romaneioItem.findMany.mockResolvedValue([
      { qtd, pecaConjunto: { opId: "o1", marca: "T67F1" } },
    ]);
  };

  it("sem apontamento nenhum, o embarque prova montagem, solda e pintura", async () => {
    mockPrisma.mesOrdem.findMany.mockResolvedValue([]);
    comRomaneio(3);
    const feito = await lerProduzidoPorSetor([P]);
    for (const s of ["CORTE", "MONTAGEM", "SOLDA", "JATO", "PINTURA"]) expect(feito(P, s)).toBe(3);
  });

  it("vale o maior: 5 apontadas na solda com 3 embarcadas continuam 5", async () => {
    mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem("Solda", 5)]);
    comRomaneio(3);
    const feito = await lerProduzidoPorSetor([P]);
    expect(feito(P, "SOLDA")).toBe(5);
  });

  it("dois romaneios da mesma marca somam — a carga pode ir partida", async () => {
    mockPrisma.mesOrdem.findMany.mockResolvedValue([]);
    mockPrisma.romaneioItem.findMany.mockResolvedValue([
      { qtd: 79, pecaConjunto: { opId: "o1", marca: "T67F1" } },
      { qtd: 5, pecaConjunto: { opId: "o1", marca: "T67F1" } },
    ]);
    const feito = await lerProduzidoPorSetor([P]);
    expect(feito(P, "MONTAGEM")).toBe(84);
  });

  it("no modo cru o romaneio não é nem consultado", async () => {
    mockPrisma.mesOrdem.findMany.mockResolvedValue([ordem("Montagem", 0)]);
    const feito = await lerProduzidoPorSetor([P], ["MONTAGEM"], { deduzirRota: false });
    expect(feito(P, "MONTAGEM")).toBe(0);
    expect(mockPrisma.romaneioItem.findMany).not.toHaveBeenCalled();
  });
});
