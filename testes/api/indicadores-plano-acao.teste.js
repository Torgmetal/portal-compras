import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(), findUnique: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: { planoAcao: {
  findUnique: mocks.findUnique, update: mocks.update,
} } }));
import { PATCH } from "@/app/api/indicadores/plano-acao/route";

const patch = (body) => PATCH(new Request("http://localhost:3000/api/indicadores/plano-acao", {
  method: "PATCH", body: JSON.stringify({ id: "plano-rh", ...body }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "usuario-rh", role: "RH" });
  mocks.findUnique.mockResolvedValue({ id: "plano-rh", indicador: "absenteismo" });
  mocks.update.mockImplementation(async ({ data }) => ({ id: "plano-rh", ...data }));
});
it("salva responsável compartilhado e descrição detalhada sem cortar texto", async () => {
  const responsavel = "RH, em conjunto com o Engenheiro de Segurança do Trabalho e, quando necessário, com os gestores dos setores e a assessoria jurídica.";
  const como = "Acompanhar as faltas, conversar com os responsáveis e registrar as medidas adotadas. ".repeat(10);
  const res = await patch({ responsavel, status: "CONCLUIDO", itens: [{ oque: "Tratar ocorrências de faltas", como, status: "CONCLUIDO", quando: "2026-08-01" }] });
  expect(res.status).toBe(200);
  expect((await res.json()).plano).toMatchObject({ responsavel, status: "CONCLUIDO", itens: [{ como }] });
});
it("identifica o campo e a ação quando um texto ultrapassa o limite", async () => {
  const res = await patch({ itens: [{ como: "x".repeat(4001) }] });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("Ação 1 — Como: use no máximo 4000 caracteres.");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("explica status inválido sem depender da mensagem padrão do Zod", async () => {
  const res = await patch({ status: "INVALIDO" });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("Situação do plano: valor inválido.");
  expect(mocks.update).not.toHaveBeenCalled();
});
it.each([["Unauthorized", 401], ["Forbidden", 403]])("preserva erro de acesso %s", async (erro, status) => {
  mocks.role.mockRejectedValue(new Error(erro));
  expect((await patch({})).status).toBe(status);
  expect(mocks.update).not.toHaveBeenCalled();
});
