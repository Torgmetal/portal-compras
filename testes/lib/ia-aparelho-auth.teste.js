// Autenticação do aparelho (token) compartilhada pelo portão de IA e pelas rotas /api/engenharia-ia/app/*.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { autenticarAparelho, respostaRecusa, comAparelho } from "@/lib/ia-aparelho-auth";
import { hashToken } from "@/lib/ia-engenharia";

const TOKEN = "tok-do-pc";
const req = (headers = {}) => new Request("http://localhost/api/engenharia-ia/app/x", { headers });
const comBearer = () => req({ authorization: `Bearer ${TOKEN}` });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.iaAparelho.findUnique.mockImplementation(async ({ where }) => (where.tokenHash === hashToken(TOKEN) ? { id: "ap1", userId: "u1", status: "ATIVO" } : null));
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", ativo: true, tipo: "USUARIO", name: "John" });
  mockPrisma.userModulo.findFirst.mockResolvedValue({ id: "m1" });
});

describe("autenticarAparelho", () => {
  it("sem token → 401", async () => expect((await autenticarAparelho(req())).recusa.status).toBe(401));

  it("aparelho REVOGADO → 401", async () => {
    mockPrisma.iaAparelho.findUnique.mockResolvedValueOnce({ id: "ap1", userId: "u1", status: "REVOGADO" });
    expect((await autenticarAparelho(comBearer())).recusa.status).toBe(401);
  });

  it("usuário sem módulo ENGENHARIA → 403", async () => {
    mockPrisma.userModulo.findFirst.mockResolvedValueOnce(null);
    expect((await autenticarAparelho(comBearer())).recusa.status).toBe(403);
  });

  it("ADMIN sem módulo passa", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1", ativo: true, tipo: "ADMIN" });
    mockPrisma.userModulo.findFirst.mockResolvedValue(null); // ADMIN nem consulta; sem Once para não vazar ao teste seguinte
    const r = await autenticarAparelho(comBearer());
    expect(r.recusa).toBeUndefined();
    expect(r.aparelho.id).toBe("ap1");
  });

  it("aceita x-api-key igual ao Bearer", async () => {
    const r = await autenticarAparelho(req({ "x-api-key": TOKEN }));
    expect(r.user.id).toBe("u1");
  });

  it("não grava uso: registrar recusa é coisa do portão", async () => {
    mockPrisma.userModulo.findFirst.mockResolvedValueOnce(null);
    await autenticarAparelho(comBearer());
    expect(mockPrisma.iaUso.create).not.toHaveBeenCalled();
  });
});

describe("respostaRecusa / comAparelho", () => {
  it("respostaRecusa devolve { ok:false, error } com o status", async () => {
    const r = respostaRecusa({ status: 403, mensagem: "sem acesso" });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, error: "sem acesso" });
  });

  it("comAparelho passa aparelho e user para fn", async () => {
    const fn = vi.fn(async () => Response.json({ ok: true }));
    const r = await comAparelho(comBearer(), fn);
    expect(r.status).toBe(200);
    expect(fn.mock.calls[0][0].user.id).toBe("u1");
  });

  it("comAparelho sem token devolve a recusa sem chamar fn", async () => {
    const fn = vi.fn();
    expect((await comAparelho(req(), fn)).status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });

  it("comAparelho converte throw em 500 sem vazar a mensagem", async () => {
    const r = await comAparelho(comBearer(), async () => { throw new Error("segredo do banco"); });
    expect(r.status).toBe(500);
    const txt = JSON.stringify(await r.json());
    expect(txt).toContain("falha interna");
    expect(txt).not.toContain("segredo");
  });
});
