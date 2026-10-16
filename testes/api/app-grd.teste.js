// O app confirma que a GRD da obra entrou no portal. Prisma simulado; nenhum teste toca o banco.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { GET } from "@/app/api/engenharia-ia/app/grd/route";
import { hashToken } from "@/lib/ia-engenharia";

const TOKEN = "tok-do-pc";
const H = { authorization: `Bearer ${TOKEN}` };
const get = (q = "?op=89", headers = H) => GET(new Request("http://localhost/api/engenharia-ia/app/grd" + q, { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.iaAparelho.findUnique.mockImplementation(async ({ where }) => (where.tokenHash === hashToken(TOKEN) ? { id: "ap1", userId: "u1", status: "ATIVO" } : null));
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", ativo: true, tipo: "USUARIO", name: "John" });
  mockPrisma.userModulo.findFirst.mockResolvedValue({ id: "m1" });
  mockPrisma.grdEngenharia.findMany.mockResolvedValue([]);
  mockPrisma.cronHeartbeat.findUnique.mockResolvedValue({ lastOkAt: new Date("2026-10-16T14:00:00Z") });
});

describe("GET /grd", () => {
  it("401 sem token; 400 sem op", async () => {
    expect((await get("?op=89", {})).status).toBe(401);
    expect((await get("")).status).toBe(400);
  });

  it("OP '89' casa 89 e 089 (e não 189); itens enxutos; ultimaLeitura do cron", async () => {
    mockPrisma.grdEngenharia.findMany.mockResolvedValue([{
      numero: "31", revisao: 1, data: new Date("2026-10-15"), itens: [{ item: 1, documento: "T89C1", revisao: "R01", descricao: "Coluna", finalidade: "Fab", copias: 1 }],
    }]);
    const j = await (await get()).json();
    const where = mockPrisma.grdEngenharia.findMany.mock.calls[0][0].where;
    expect(where.opNumero.in.sort()).toEqual(["089", "89"]);
    expect(j.ok).toBe(true);
    expect(j.grds).toEqual([{ numero: "31", revisao: 1, data: "2026-10-15T00:00:00.000Z", itens: [{ documento: "T89C1", rev: "R01", descricao: "Coluna" }] }]);
    expect(j.ultimaLeitura).toBe("2026-10-16T14:00:00.000Z");
    expect(mockPrisma.cronHeartbeat.findUnique.mock.calls[0][0].where).toEqual({ job: "grd-sincronizar" });
  });

  it("desde filtra por createdAt; desde inválido é 400", async () => {
    await get("?op=089&desde=2026-10-10T00:00:00Z");
    const where = mockPrisma.grdEngenharia.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ gte: new Date("2026-10-10T00:00:00Z") });
    expect((await get("?op=89&desde=lixo")).status).toBe(400);
  });

  it("sem heartbeat, ultimaLeitura é null", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue(null);
    expect((await (await get()).json()).ultimaLeitura).toBeNull();
  });
});
