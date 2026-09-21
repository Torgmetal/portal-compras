import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Lais" }) }));
import { GET, PATCH } from "@/app/api/campo/foto/route";

// Vitor (16/09/2026): legenda escrita pelo inspetor, editável na foto já subida — sem apagar a área.
const req = (b) => new Request("http://localhost/api/campo/foto", { method: "PATCH", body: JSON.stringify(b) });
beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.fotoInspecao.findUnique.mockResolvedValue({ tipo: "PINTURA", relatorioId: "r1" });
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue({ envioAssinaturaId: null, codigo: "RIP-103-002" });
  mockPrisma.fotoInspecao.update.mockResolvedValue({});
});

it("só a legenda: grava a observação e NÃO toca na área", async () => {
  const res = await PATCH(req({ id: "f1", observacao: "  Trinca na solda do flange, lado norte  " }));
  expect(res.status).toBe(200);
  expect(mockPrisma.fotoInspecao.update.mock.calls[0][0].data).toEqual({ observacao: "Trinca na solda do flange, lado norte" });
});

it("legenda vazia limpa a observação (null)", async () => {
  await PATCH(req({ id: "f1", observacao: "   " }));
  expect(mockPrisma.fotoInspecao.update.mock.calls[0][0].data).toEqual({ observacao: null });
});

it("só a área: comportamento de antes, sem mexer na legenda", async () => {
  const res = await PATCH(req({ id: "f1", evidencia: "espessura" }));
  expect(res.status).toBe(200);
  expect(mockPrisma.fotoInspecao.update.mock.calls[0][0].data).toEqual({ evidencia: "espessura" });
});

it("nada para alterar → 400; relatório em assinatura → 409", async () => {
  expect((await PATCH(req({ id: "f1" }))).status).toBe(400);
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue({ envioAssinaturaId: "env", codigo: "RIP-103-002" });
  expect((await PATCH(req({ id: "f1", observacao: "x" }))).status).toBe(409);
  expect(mockPrisma.fotoInspecao.update).not.toHaveBeenCalled();
});


it("carrega todas as fotos vinculadas ao relatório, sem teto de 60", async () => {
  mockPrisma.fotoInspecao.findMany.mockResolvedValue([]);
  const res = await GET(new Request("http://localhost/api/campo/foto?relatorioId=r1"));
  expect(res.status).toBe(200);
  expect(mockPrisma.fotoInspecao.findMany).toHaveBeenCalledWith(expect.not.objectContaining({ take: expect.anything() }));
});
