// Ajustes por marca do simulador de carga — rota por OP: grava, apaga quando vazio, recusa medida incompleta.
import { beforeEach, it, expect, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1", name: "Vitor" })) }));
import { GET, PUT } from "@/app/api/comercial/op/[id]/ajustes-carga/route";

const put = (body) => PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) }), { params: { id: "op1" } });
beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findUnique.mockResolvedValue({ id: "op1", numero: "118" });
  mockPrisma.ajusteCargaMarca.findUnique.mockResolvedValue(null);
  mockPrisma.ajusteCargaMarca.findMany.mockResolvedValue([{ marca: "T118A1", regras: { posicao: "chao" } }]);
  mockPrisma.ajusteCargaMarca.upsert.mockResolvedValue({});
  mockPrisma.ajusteCargaMarca.delete.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("GET devolve o mapa marca → regras da obra", async () => {
  const j = await (await GET(null, { params: { id: "op1" } })).json();
  expect(j.ajustes).toEqual({ T118A1: { posicao: "chao" } });
});
it("PUT normaliza e grava a regra (marca em maiúsculas)", async () => {
  const r = await put({ marca: "t118c7", regras: { embalagem: "solta", juntoCom: "", medidas: null } });
  expect(r.status).toBe(200);
  expect(mockPrisma.ajusteCargaMarca.upsert.mock.calls[0][0].create).toMatchObject({ opId: "op1", marca: "T118C7", regras: { embalagem: "solta" } });
});
it("PUT com regras vazias apaga o ajuste existente", async () => {
  mockPrisma.ajusteCargaMarca.findUnique.mockResolvedValueOnce({ id: "aj1", regras: { posicao: "chao" } });
  await put({ marca: "T118A1", regras: {} });
  expect(mockPrisma.ajusteCargaMarca.delete).toHaveBeenCalledWith({ where: { id: "aj1" } });
  expect(mockPrisma.ajusteCargaMarca.upsert).not.toHaveBeenCalled();
});
it("PUT recusa medida à mão incompleta", async () => {
  const r = await put({ marca: "72162417", regras: { medidas: { C: 3000 } } });
  expect(r.status).toBe(400); expect((await r.json()).error).toMatch(/medidas/i);
});
