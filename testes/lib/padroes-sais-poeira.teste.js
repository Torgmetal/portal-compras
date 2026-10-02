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
