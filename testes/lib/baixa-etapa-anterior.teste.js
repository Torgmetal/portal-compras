// Apontamento na frente prova que a peça passou atrás — a planilha de furos do Syneco.
// Vitor (17/09/2026): "se a peça estava apontada na pintura já indicava que tinha que dar baixa nos
// setores anteriores que não foram dado baixa".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { lancamentosAtrasados, agruparOrdens, inicioDaCadeia, baixasDeEtapaAnterior } from "@/lib/baixa-etapa-anterior";

const setor = (produzido, planejado = 4) => ({ produzido, planejado });

describe("lancamentosAtrasados — o que falta lançar atrás", () => {
  it("peça pintada manda lançar montagem e solda, com a prova do setor mais adiantado", () => {
    const r = lancamentosAtrasados({ setores: { Montagem: setor(0), Solda: setor(1), Jato: setor(4), Pintura: setor(4) } });
    expect(r).toEqual([
      { setor: "Montagem", apontado: 0, aLancar: 4, provaSetor: "Pintura", provaQtd: 4 },
      { setor: "Solda", apontado: 1, aLancar: 3, provaSetor: "Pintura", provaQtd: 4 },
    ]);
  });

  it("setor SEM ordem no Syneco não vira alvo — a peça não passa por ali", () => {
    // sem Preparação na lista: nada a lançar nela, mesmo com a Pintura cheia
    const r = lancamentosAtrasados({ setores: { Corte: setor(4), Pintura: setor(4) } });
    expect(r).toEqual([]);
  });

  it("Acabamento é opcional e nunca é cobrado", () => {
    const r = lancamentosAtrasados({ setores: { Acabamento: setor(0), Jato: setor(4), Pintura: setor(4) } });
    expect(r).toEqual([]);
  });

  it("não pede mais do que o Syneco planejou para aquele setor", () => {
    const r = lancamentosAtrasados({ setores: { Solda: { produzido: 0, planejado: 2 }, Pintura: setor(4) } });
    expect(r).toEqual([{ setor: "Solda", apontado: 0, aLancar: 2, provaSetor: "Pintura", provaQtd: 4 }]);
  });

  it("nada a lançar quando a cadeia já está coerente, nem quando não há apontamento na frente", () => {
    expect(lancamentosAtrasados({ setores: { Solda: setor(4), Pintura: setor(4) } })).toEqual([]);
    expect(lancamentosAtrasados({ setores: { Montagem: setor(0), Solda: setor(0) } })).toEqual([]);
  });
});

describe("terceiro e encaminhamento cortam a cadeia", () => {
  it("peça que volta do terceiro no Jato não deve nada à montagem e à solda", () => {
    const peca = { terceirizado: true, destinoTerceirizado: "JATO", setores: { Montagem: setor(0), Solda: setor(0), Jato: setor(0), Pintura: setor(4) } };
    expect(lancamentosAtrasados(peca)).toEqual([{ setor: "Jato", apontado: 0, aLancar: 4, provaSetor: "Pintura", provaQtd: 4 }]);
  });

  it("terceiro sem destino, ou que volta direto para a expedição, fica fora da lista", () => {
    expect(inicioDaCadeia({ terceirizado: true })).toBe(-1);
    expect(inicioDaCadeia({ terceirizado: true, destinoTerceirizado: "EXPEDICAO" })).toBe(-1);
    expect(lancamentosAtrasados({ terceirizado: true, setores: { Solda: setor(0), Pintura: setor(4) } })).toEqual([]);
  });

  it("encaminhamento direto começa a cadeia no setor encaminhado", () => {
    expect(inicioDaCadeia({ encaminhadoSetor: "JATO" })).toBe(5);
    expect(inicioDaCadeia({})).toBe(0);
  });
});

describe("agruparOrdens", () => {
  const ordem = (extra) => ({ opId: "op1", obra: "T89A", item: "T89A1", op: "ordem1", operacao: "Solda", setor: "Solda", produzidoUn: 0, planejadoUn: 4, ...extra });

  it("soma produzido e planejado por (OP, obra, marca) e setor", () => {
    const g = agruparOrdens([ordem({ produzidoUn: 1 }), ordem({ produzidoUn: 2 }), ordem({ setor: "Pintura", operacao: "Pintura", produzidoUn: 4 })]);
    expect([...g.values()][0].setores).toEqual({ Solda: { produzido: 3, planejado: 8 }, Pintura: { produzido: 4, planejado: 4 } });
  });

  it("a mesma marca em outra obra do Syneco é outro grupo", () => {
    expect(agruparOrdens([ordem(), ordem({ obra: "T89C" })]).size).toBe(2);
  });

  it("etapa inativada e sem produção é feita FORA — o zero dela não é furo", () => {
    const g = agruparOrdens([ordem(), ordem({ setor: "Pintura", operacao: "Pintura", produzidoUn: 4 })], [{ op: "ordem1", item: "T89A1", operacao: "Solda" }]);
    expect([...g.values()][0].setores.Solda).toBeUndefined();
  });
});

describe("baixasDeEtapaAnterior — a lista pronta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.oP.findMany.mockResolvedValue([{ id: "op1", numero: "089", obra: "TERMASA" }]);
    mockPrisma.mesOrdem.findMany.mockResolvedValue([
      { opId: "op1", obra: "T89A", item: "T89A1", setor: "Solda", produzidoUn: 0, planejadoUn: 4, op: "o1", operacao: "Solda" },
      { opId: "op1", obra: "T89A", item: "T89A1", setor: "Pintura", produzidoUn: 4, planejadoUn: 4, op: "o1", operacao: "Pintura" },
    ]);
    mockPrisma.mesInativo.findMany.mockResolvedValue([]);
    mockPrisma.pecaConjunto.findMany.mockResolvedValue([{ opId: "op1", marca: "T89A1", descricao: "CONJUNTO", qte: 4, pesoUnitKg: 10, terceirizado: false, destinoTerceirizado: null, encaminhadoSetor: null }]);
  });

  it("monta a linha com obra do Syneco, peso e a prova do apontamento à frente", async () => {
    const r = await baixasDeEtapaAnterior({});
    expect(r.linhas).toEqual([{
      opNumero: "089", obra: "TERMASA", obraSyneco: "T89A", marca: "T89A1", descricao: "CONJUNTO",
      setorSyneco: "Solda", apontado: 0, aLancar: 4, pesoALancarKg: 40, prova: "Pintura tem 4 apontada(s)",
    }]);
    expect(r.total).toEqual({ linhas: 1, pecas: 4, kg: 40, marcas: 1 });
  });

  it("filtra por setor e só olha obra viva", async () => {
    expect((await baixasDeEtapaAnterior({ setorSyneco: "Montagem" })).linhas).toEqual([]);
    expect(mockPrisma.oP.findMany.mock.calls[0][0].where.status).toEqual({ notIn: ["ENCERRADA", "CANCELADA"] });
  });

  it("sem OP viva não consulta o Syneco", async () => {
    mockPrisma.oP.findMany.mockResolvedValue([]);
    expect((await baixasDeEtapaAnterior({})).total.linhas).toBe(0);
    expect(mockPrisma.mesOrdem.findMany).not.toHaveBeenCalled();
  });
});
