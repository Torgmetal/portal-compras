// A rota que toca a geração no servidor: aceita a sessão (tela) ou o CRON_SECRET (ela mesma, continuando).
import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
const requireRole = vi.fn();
vi.mock("@/lib/session", () => ({ requireRole: (...a) => requireRole(...a) }));
const processar = vi.fn();
vi.mock("@/lib/databook-volumes", () => ({ processarGeracao: (...a) => processar(...a) }));
import { POST } from "@/app/api/qualidade/data-books/[id]/gerar/servidor/route";

const chamar = (headers = {}) => POST(new Request("https://workspace.torg.com.br/x", { method: "POST", headers }), { params: { id: "b94" } });
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3gr3d0";
  mockPrisma.dataBookGeracao.findFirst.mockResolvedValue({ id: "j94" });
  processar.mockResolvedValue({ concluido: true });
});

it("pela tela: exige Qualidade/Admin e toca até concluir", async () => {
  requireRole.mockResolvedValue({ id: "u" });
  const j = await (await chamar()).json();
  expect(requireRole).toHaveBeenCalled();
  expect(processar).toHaveBeenCalledWith("j94");
  expect(j).toMatchObject({ ok: true, concluido: true });
});

it("pelo segredo dos crons (ela mesma continuando): não pede sessão", async () => {
  await chamar({ authorization: "Bearer s3gr3d0" });
  expect(requireRole).not.toHaveBeenCalled();
  expect(processar).toHaveBeenCalled();
});

it("sem sessão e sem segredo: 401", async () => {
  requireRole.mockRejectedValue(new Error("Unauthorized"));
  expect((await chamar({ authorization: "Bearer errado" })).status).toBe(401);
  expect(processar).not.toHaveBeenCalled();
});
