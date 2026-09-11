import { beforeEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
const mocks = vi.hoisted(() => ({ sessao: vi.fn(), findUnique: vi.fn(), audit: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.sessao }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { planoAcao: { findUnique: mocks.findUnique }, auditLog: { create: mocks.audit } } }));
import { GET } from "@/app/api/qualidade/planos-acao/[id]/pdf/route";
const get = () => GET(null, { params: { id: "pa21" } });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.sessao.mockResolvedValue({ user: { id: "rh", tipo: "USUARIO", modulos: ["RH"] } });
  mocks.findUnique.mockResolvedValue({ id: "pa21", numero: 21, titulo: "Absenteísmo", indicador: "absenteismo", processo: "RH", status: "CONCLUIDO", itens: [{ oque: "Acompanhar faltas", quanto: "Sem custo adicional. ".repeat(11), status: "CONCLUIDO" }] });
  mocks.audit.mockResolvedValue({});
});
it("RH gera PDF válido do plano de seu indicador", async () => {
  const res = await get();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/pdf");
  expect((await PDFDocument.load(await res.arrayBuffer())).getPageCount()).toBeGreaterThan(0);
});
it("RH não exporta plano interno da Qualidade", async () => {
  mocks.findUnique.mockResolvedValue({ id: "interno", indicador: null });
  expect((await get()).status).toBe(403);
  expect(mocks.audit).not.toHaveBeenCalled();
});
it("RH não exporta indicador de outro setor", async () => {
  mocks.findUnique.mockResolvedValue({ id: "outro", indicador: "retrabalho", processo: "PRODUCAO" });
  expect((await get()).status).toBe(403);
});
it.each([{ tipo: "ADMIN", modulos: [] }, { tipo: "USUARIO", modulos: ["QUALIDADE"] }])("preserva exportação da Qualidade para %j", async (user) => {
  mocks.sessao.mockResolvedValue({ user });
  mocks.findUnique.mockResolvedValue({ numero: 1, titulo: "Interno", indicador: null, status: "EM_ANDAMENTO", itens: [] });
  expect((await get()).status).toBe(200);
});
it("exige login", async () => {
  mocks.sessao.mockResolvedValue(null);
  expect((await get()).status).toBe(401);
});
