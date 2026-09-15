import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { proximoNumero } from "@/lib/relatorio-inspecao";

// A OP-089 (15/09/2026): o RIP-089-001 foi criado e apagado duas vezes; só o maior número VIVO
// contava, e o terceiro relatório nasceu 001 de novo — dois PDFs "001" na pasta da obra.
beforeEach(() => vi.clearAllMocks());

it("não reaproveita número de relatório apagado: o AuditLog manda", async () => {
  mockPrisma.relatorioInspecao.findFirst.mockResolvedValue(null); // nenhum vivo
  mockPrisma.auditLog.findMany.mockResolvedValue([
    { diff: { codigo: "RIP-089-001" } }, { diff: { codigo: "RIP-089-001" } }, { diff: { codigo: "RIP-089-002" } },
  ]);
  expect(await proximoNumero("089", "PINTURA")).toBe(3);
  const where = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
  expect(where.diff.string_starts_with).toBe("RIP-089-");
});

it("com relatórios vivos vale o maior dos dois lados", async () => {
  mockPrisma.relatorioInspecao.findFirst.mockResolvedValue({ numero: 5 });
  mockPrisma.auditLog.findMany.mockResolvedValue([{ diff: { codigo: "RIP-089-002" } }]);
  expect(await proximoNumero("089", "PINTURA")).toBe(6);
});

it("sem histórico nenhum começa em 1; código de outra série não conta", async () => {
  mockPrisma.relatorioInspecao.findFirst.mockResolvedValue(null);
  mockPrisma.auditLog.findMany.mockResolvedValue([{ diff: { codigo: "RIP-0890-007" } }, { diff: { codigo: "EVS-089-004" } }]);
  expect(await proximoNumero("089", "PINTURA")).toBe(1);
});

it("falha na consulta do AuditLog não derruba a criação", async () => {
  mockPrisma.relatorioInspecao.findFirst.mockResolvedValue({ numero: 2 });
  mockPrisma.auditLog.findMany.mockRejectedValue(new Error("db"));
  expect(await proximoNumero("089", "PINTURA")).toBe(3);
});
