// Sais e poeira (02/10/2026) nascem preenchidos com o que é da casa e da obra — Vitor: "até mesmo ver
// informações que já possam vir pré-preenchidas" — e lembram o que for ajustado, por obra, como os
// outros relatórios. Medições e laudos nunca entram nessa memória.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
import { valoresIniciaisInspecao, salvarInspecaoComPadroes } from "@/lib/padroes-inspecao";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.padraoInspecao.findMany.mockResolvedValue([]);
  mockPrisma.oP.findFirst.mockResolvedValue({ id: "op112", numero: "112", cliente: "CLI" });
  mockPrisma.oPKickOff.findFirst.mockResolvedValue({ pedidoCompraCliente: "PC 4500123" });
});

describe("valores iniciais de sais e poeira", () => {
  it("sais nasce com o Bresle padrão, o PO-05, o pedido do cliente e o termômetro da casa — sem medição", async () => {
    const r = await valoresIniciaisInspecao("112", "SAIS");
    expect(r).toMatchObject({ volumeAgua: "3", areaCelula: "12,5", ordemCompra: "PC 4500123", aparelho: "Condutivímetro", tmTag: "TM-01" });
    expect(r.documentoReferencia).toMatch(/PO-05/);
    expect(r.amostras).toBeUndefined();
    expect(r.requisito).toBeUndefined(); // critério é do contrato: vem da memória da obra, não de um chute
  });

  it("poeira nasce com a fita, a lupa de 10× e o pedido do cliente", async () => {
    const r = await valoresIniciaisInspecao("112", "POEIRA");
    expect(r).toMatchObject({ ampliacao: "Lupa 10×", ordemCompra: "PC 4500123" });
    expect(r.fitaAdesiva).toMatch(/8502-3/);
    expect(r.testes).toBeUndefined();
  });

  it("sem Kick Off, a ordem de compra fica em branco (não falha a criação)", async () => {
    mockPrisma.oPKickOff.findFirst.mockRejectedValue(new Error("sem tabela"));
    const r = await valoresIniciaisInspecao("112", "SAIS");
    expect(r.ordemCompra ?? "").toBe("");
  });

  it("o requisito e o aparelho ajustados num relatório valem para o próximo da mesma obra", async () => {
    await salvarInspecaoComPadroes({ id: "r", opNumero: "112", tipo: "SAIS", resultados: {} },
      { resultados: { requisito: "20", apModelo: "Horiba EC-33", amostras: [{ condAgua: "1" }] } }, "u");
    expect(mockPrisma.padraoInspecao.upsert.mock.calls.map((c) => c[0].create.campo).sort()).toEqual(["apModelo", "requisito"]);
    mockPrisma.padraoInspecao.findMany.mockResolvedValue([{ campo: "requisito", valor: "20" }, { campo: "apModelo", valor: "Horiba EC-33" }]);
    expect(await valoresIniciaisInspecao("112", "SAIS")).toMatchObject({ requisito: "20", apModelo: "Horiba EC-33" });
  });
});

// Pull-off e recebimento de tintas (02/10/2026): o mesmo princípio — o que é da casa e da obra já vem; o
// que é medido (dollies, datas, itens do recebimento) nunca.
describe("valores iniciais do pull-off e do recebimento", () => {
  beforeEach(() => {
    mockPrisma.planoPintura.findUnique.mockResolvedValue({ opNumero: "112", espessuraTotal: 330, demaos: [
      { ordem: 2, espessuraMin: 150 }, { ordem: 1, espessuraMin: 120 }, { ordem: 3, espessuraMin: 60 },
    ] });
    mockPrisma.relatorioInspecao.findMany.mockResolvedValue([
      { resultados: { pullOffEquip: "N/A" } }, { resultados: { pullOffEquip: "Elcometer 510" } },
    ]);
  });

  it("pull-off nasce com a norma, o PO-05, o pedido do cliente, o esquema do PLP e o aparelho do RIP — sem dolly", async () => {
    const r = await valoresIniciaisInspecao("112", "PULL_OFF");
    expect(r).toMatchObject({ normas: "ASTM D4541", ordemCompra: "PC 4500123", aparelho: "Elcometer 510", esquema: ["120", "150", "60"] });
    expect(r.documentoReferencia).toMatch(/PO-05/);
    expect(r.dollies).toBeUndefined();
    expect(r.dataFixacao).toBeUndefined();
  });

  it("PLP cuja soma das demãos não fecha com o total (micragem acumulada): o esquema fica para o inspetor", async () => {
    mockPrisma.planoPintura.findUnique.mockResolvedValue({ espessuraTotal: 330, demaos: [{ ordem: 1, espessuraMin: 120 }, { ordem: 2, espessuraMin: 270 }, { ordem: 3, espessuraMin: 330 }] });
    const r = await valoresIniciaisInspecao("112", "PULL_OFF");
    expect(r.esquema).toBeUndefined();
  });

  it("sem PLP e sem RIP o pull-off nasce mesmo assim (não falha a criação)", async () => {
    mockPrisma.planoPintura.findUnique.mockRejectedValue(new Error("sem tabela"));
    mockPrisma.relatorioInspecao.findMany.mockRejectedValue(new Error("fora do ar"));
    const r = await valoresIniciaisInspecao("112", "PULL_OFF");
    expect(r).toMatchObject({ normas: "ASTM D4541" });
    expect(r.aparelho ?? "").toBe("");
  });

  it("recebimento nasce com o contrato (pedido do cliente) e o local da casa — sem lote nem item marcado", async () => {
    const r = await valoresIniciaisInspecao("112", "RECEBIMENTO_TINTA");
    expect(r).toMatchObject({ contrato: "PC 4500123", localEquipamento: "Almoxarifado Torg Metal" });
    expect(r.lotes).toBeUndefined();
    expect(r.checklist).toBeUndefined();
  });

  it("o adesivo e o aparelho ajustados num pull-off valem para o próximo da mesma obra; os dollies nunca", async () => {
    await salvarInspecaoComPadroes({ id: "r", opNumero: "112", tipo: "PULL_OFF", resultados: {} },
      { resultados: { adesivo: "Araldite 24h", aparelho: "PosiTest AT-A", dollies: [{ adesao: "8" }], dataFixacao: "2026-10-01" } }, "u");
    expect(mockPrisma.padraoInspecao.upsert.mock.calls.map((c) => c[0].create.campo).sort()).toEqual(["adesivo", "aparelho"]);
  });

  it("demão do PLP sem espessura mínima não vira '0' no esquema", async () => {
    mockPrisma.planoPintura.findUnique.mockResolvedValue({ espessuraTotal: 330, demaos: [{ ordem: 1, espessuraMin: 120 }, { ordem: 2, espessuraMin: null }, { ordem: 3, espessuraMin: 210 }] });
    const r = await valoresIniciaisInspecao("112", "PULL_OFF");
    expect(r.esquema).toBeUndefined();
  });

  it("o documento de referência lembrado pela obra volta inteiro (até 500, o que a tela aceita)", async () => {
    const doc = "X".repeat(480);
    await salvarInspecaoComPadroes({ id: "r", opNumero: "112", tipo: "PULL_OFF", resultados: {} }, { resultados: { documentoReferencia: doc } }, "u");
    expect(mockPrisma.padraoInspecao.upsert.mock.calls[0][0].create.valor).toHaveLength(480);
  });
});
