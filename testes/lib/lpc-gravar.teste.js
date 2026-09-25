// Importação da LPC em LOTE. Mike (Engenharia, 25/09/2026) subindo a LPC da T118B: "HTTP 504 — o
// servidor demorou demais". A rota gravava peça a peça (uma busca + uma gravação cada) e o servidor da
// Vercel roda em Washington (iad1) com o banco em São Paulo: ~120 ms por ida e volta, ~240 ms por peça.
// As 1.240 peças esgotaram os 300 s antes das ligações conjunto → croqui (só 22 gravadas).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
import { gravarPecasLpc, gravarRelacoesLpc, emParalelo } from "@/lib/lpc-gravar";

const maquinaDe = (x) => (x.perfil === "CH" ? "PLASMA" : null);
const parsed = {
  conjuntos: [
    { marca: "T118B1", descricao: "COLUNA", qte: 1, pesoUnitKg: 100, pesoTotalKg: 100, areaPinturaM2: 3, observacao: null },
    { marca: "T118B2", descricao: "VIGA", qte: 2, pesoUnitKg: 50, pesoTotalKg: 100, areaPinturaM2: 2, observacao: "revisar" },
  ],
  croquis: [
    { marca: "T118B-P1", descricao: "W200X15", material: "A572", perfil: "W", qte: 1, comprimentoMm: 800, pesoUnitKg: 12, pesoTotalKg: 12, areaPinturaM2: 0.6 },
    { marca: "T118B-P2", descricao: "CH9.5X100", material: "A36", perfil: "CH", qte: 4, comprimentoMm: 100, pesoUnitKg: 1, pesoTotalKg: 4, areaPinturaM2: 0.1 },
  ],
  avulsas: [
    { marca: "T118B-A1", descricao: "CHUMBADOR", material: "A36", perfil: "BR", qte: 8, comprimentoMm: 500, pesoUnitKg: 2, pesoTotalKg: 16, areaPinturaM2: 0 },
  ],
  relacoes: [
    { conjuntoMarca: "T118B1", croquiMarca: "T118B-P1", qtdNoConjunto: 2 },
    { conjuntoMarca: "T118B2", croquiMarca: "T118B-P2", qtdNoConjunto: 1 },
    { conjuntoMarca: "T118B2", croquiMarca: "T118B-P1", qtdNoConjunto: 1 },
    { conjuntoMarca: "T118B2", croquiMarca: "T118B-P2", qtdNoConjunto: 1 }, // repetida: grava uma vez
    { conjuntoMarca: "T118B9", croquiMarca: "T118B-P1", qtdNoConjunto: 1 }, // conjunto fora da lista: ignora
  ],
};
// já existiam: um conjunto e um croqui já em produção (a preparação e a máquina não podem voltar atrás)
const EXISTENTES = [
  { id: "id-B1", marca: "T118B1", statusPrep: null, maquina: null },
  { id: "id-P1", marca: "T118B-P1", statusPrep: "CORTADO", maquina: "SERRA" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.pecaConjunto.findMany.mockResolvedValue(EXISTENTES);
  mockPrisma.pecaConjunto.createManyAndReturn.mockImplementation(async ({ data }) => data.map((d) => ({ id: `id-${d.marca.replace("T118", "")}`, marca: d.marca })));
  mockPrisma.pecaConjunto.update.mockResolvedValue({});
  mockPrisma.conjuntoCroqui.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.conjuntoCroqui.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
});

const grava = () => gravarPecasLpc(mockPrisma, { opId: "op118", opNumero: "T118B", parsed, maquinaDe });

describe("peças: uma leitura, criação em lote, atualização em paralelo", () => {
  it("nenhuma busca por peça — as existentes vêm de uma leitura só", async () => {
    await grava();
    expect(mockPrisma.pecaConjunto.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.pecaConjunto.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.pecaConjunto.findMany.mock.calls[0][0].where).toEqual({ opNumero: "T118B", marca: { in: ["T118B1", "T118B2", "T118B-P1", "T118B-P2", "T118B-A1"] } });
  });

  it("as novas nascem num lote, com os mesmos campos de antes", async () => {
    const r = await grava();
    expect(mockPrisma.pecaConjunto.createManyAndReturn).toHaveBeenCalledTimes(1);
    const [{ data }] = mockPrisma.pecaConjunto.createManyAndReturn.mock.calls[0];
    const porMarca = Object.fromEntries(data.map((d) => [d.marca, d]));
    expect(porMarca.T118B2).toEqual({ opId: "op118", opNumero: "T118B", marca: "T118B2", descricao: "VIGA", qte: 2, pesoUnitKg: 50, pesoTotalKg: 100,
      tipoPeca: "CONJUNTO", areaPinturaM2: 2, observacao: "revisar", status: "PENDENTE", fonte: "LPC_IMPORT", naLPC: true });
    expect(porMarca["T118B-P2"]).toMatchObject({ tipoPeca: "CROQUI", statusPrep: "PENDENTE", status: "PENDENTE", maquina: "PLASMA", comprimentoMm: 100 });
    expect(porMarca["T118B-A1"]).not.toHaveProperty("tipoPeca"); // avulsa nunca teve tipo
    expect(porMarca["T118B-A1"]).toMatchObject({ status: "PENDENTE", fonte: "LPC_IMPORT", naLPC: true, maquina: null });
    expect(r).toMatchObject({ criados: 3, atualizados: 2, ignorados: 0 });
  });

  it("as existentes são atualizadas sem perder a preparação nem a máquina", async () => {
    await grava();
    const upd = Object.fromEntries(mockPrisma.pecaConjunto.update.mock.calls.map(([x]) => [x.where.id, x.data]));
    expect(upd["id-B1"]).toEqual({ descricao: "COLUNA", qte: 1, pesoUnitKg: 100, pesoTotalKg: 100, tipoPeca: "CONJUNTO", areaPinturaM2: 3, observacao: undefined, naLPC: true, fonte: "LPC_IMPORT" });
    expect(upd["id-P1"]).toMatchObject({ tipoPeca: "CROQUI", statusPrep: "CORTADO", maquina: "SERRA", naLPC: true, fonte: "LPC_IMPORT" });
  });

  it("devolve o id de cada marca — novas e existentes — para as ligações", async () => {
    const { pieceIds } = await grava();
    expect(Object.fromEntries(pieceIds)).toEqual({ T118B1: "id-B1", T118B2: "id-B2", "T118B-P1": "id-P1", "T118B-P2": "id-B-P2", "T118B-A1": "id-B-A1" });
  });

  it("lote recusado (marca criada no meio do caminho): cai para uma a uma, e conta o que falhar", async () => {
    mockPrisma.pecaConjunto.createManyAndReturn.mockRejectedValueOnce(new Error("Unique constraint failed"));
    mockPrisma.pecaConjunto.create.mockImplementation(async ({ data }) => {
      if (data.marca === "T118B2") throw new Error("Unique constraint failed");
      return { id: `id1-${data.marca}`, marca: data.marca };
    });
    const r = await grava();
    expect(r).toMatchObject({ criados: 2, atualizados: 2, ignorados: 1 });
    expect(r.pieceIds.has("T118B2")).toBe(false);
  });

  it("marca repetida entre as listas continua como antes: nasce uma vez e a segunda linha a atualiza", async () => {
    const repetido = { ...parsed, avulsas: [...parsed.avulsas, { marca: "T118B2", descricao: "VIGA AVULSA", material: "A36", perfil: "W", qte: 1, comprimentoMm: 10, pesoUnitKg: 1, pesoTotalKg: 1, areaPinturaM2: 0 }] };
    const r = await gravarPecasLpc(mockPrisma, { opId: "op118", opNumero: "T118B", parsed: repetido, maquinaDe });
    const criadas = mockPrisma.pecaConjunto.createManyAndReturn.mock.calls.flatMap(([x]) => x.data.map((d) => d.marca));
    expect(criadas.filter((m) => m === "T118B2")).toHaveLength(1);
    const segunda = mockPrisma.pecaConjunto.update.mock.calls.find(([x]) => x.where.id === "id-B2");
    expect(segunda[0].data).toMatchObject({ descricao: "VIGA AVULSA", naLPC: true, fonte: "LPC_IMPORT" });
    expect(r).toMatchObject({ criados: 3, atualizados: 3 });
  });
});

describe("ligações conjunto → croqui em lote", () => {
  it("apaga as ligações dos conjuntos importados e grava todas de uma vez, sem repetir", async () => {
    const { pieceIds } = await grava();
    const n = await gravarRelacoesLpc(mockPrisma, { parsed, pieceIds });
    expect(mockPrisma.conjuntoCroqui.deleteMany).toHaveBeenCalledWith({ where: { conjuntoId: { in: ["id-B1", "id-B2"] } } });
    expect(mockPrisma.conjuntoCroqui.create).not.toHaveBeenCalled();
    expect(mockPrisma.conjuntoCroqui.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.conjuntoCroqui.createMany.mock.calls[0][0]).toEqual({
      data: [
        { conjuntoId: "id-B1", croquiId: "id-P1", qtdNoConjunto: 2 },
        { conjuntoId: "id-B2", croquiId: "id-B-P2", qtdNoConjunto: 1 },
        { conjuntoId: "id-B2", croquiId: "id-P1", qtdNoConjunto: 1 },
      ],
      skipDuplicates: true,
    });
    expect(n).toBe(3);
  });
});

describe("paralelo com teto", () => {
  it("processa tudo e nunca passa de N ao mesmo tempo", async () => {
    let agora = 0, pico = 0; const feitos = [];
    await emParalelo(Array.from({ length: 50 }, (_, i) => i), 12, async (i) => {
      agora++; pico = Math.max(pico, agora);
      await new Promise((r) => setTimeout(r, 1));
      feitos.push(i); agora--;
    });
    expect(feitos.sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(pico).toBeLessThanOrEqual(12);
    expect(pico).toBeGreaterThan(1);
  });
});
