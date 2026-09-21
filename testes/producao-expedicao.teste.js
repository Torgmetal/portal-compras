import { it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { romaneio: { findMany: vi.fn(), count: vi.fn() } },
}));
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/producao/expedicao/route";
beforeEach(() => vi.resetAllMocks());
it("protege acesso e valida OP", async () => {
  requireRole.mockRejectedValueOnce(new Error("Unauthorized"));
  expect((await GET(new Request("http://localhost/?opId=a"))).status).toBe(401);
  requireRole.mockResolvedValue({});
  expect((await GET(new Request("http://localhost/"))).status).toBe(400);
  expect(prisma.romaneio.findMany).not.toHaveBeenCalled();
});
it("consulta só romaneios da OP com paginação e sem valores comerciais", async () => {
  requireRole.mockResolvedValue({});
  prisma.romaneio.findMany.mockResolvedValue([]);
  prisma.romaneio.count.mockResolvedValue(30);
  const r = await GET(new Request("http://localhost/?opId=a&pagina=2"));
  expect(r.status).toBe(200);
  const a = prisma.romaneio.findMany.mock.calls[0][0];
  expect(a.where).toEqual({ opId: "a" });
  expect(a.skip).toBe(20);
  expect(a.select.valorTotal).toBeUndefined();
  expect((await r.json()).paginas).toBe(2);
});
