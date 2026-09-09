import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: vi.fn(), head: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
vi.mock("@/lib/prisma", () => {
  const banco = { auditoriaInterna: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany }, auditLog: { create: mocks.audit } };
  return { prisma: { ...banco, $transaction: async (fn) => fn(banco) } };
});
import { POST } from "@/app/api/qualidade/auditorias-internas/[id]/relatorio/route";
import { GET } from "@/app/api/qualidade/auditorias-internas/[id]/route";

const url = "https://exemplo.public.blob.vercel-storage.com/qualidade/auditorias/ai1/relatorio-abc.pdf";
const contexto = { params: { id: "ai1" } };
const enviar = (body = { url, nome: "Relatório.pdf" }) => POST(new Request("http://localhost/api/relatorio", { method: "POST", body: JSON.stringify(body) }), contexto);
let registro;
beforeEach(() => {
  vi.resetAllMocks();
  registro = { id: "ai1", status: "AGENDADA", conclusao: "Texto preservado", relatorioAnexo: null };
  mocks.role.mockResolvedValue({ id: "usuario" });
  mocks.findUnique.mockImplementation(async () => ({ ...registro }));
  mocks.updateMany.mockImplementation(async ({ where, data }) => {
    if (registro.status !== where.status) return { count: 0 };
    registro = { ...registro, ...data }; return { count: 1 };
  });
  mocks.update.mockImplementation(async ({ data }) => { registro = { ...registro, ...data }; return registro; });
  mocks.audit.mockResolvedValue({});
  mocks.head.mockResolvedValue({ url, contentType: "application/pdf", size: 2048 });
});
it("salva o anexo, preserva o texto e devolve o link ao reabrir a auditoria", async () => {
  expect((await enviar()).status).toBe(200);
  const resposta = await (await GET(null, contexto)).json();
  expect(resposta.auditoria).toMatchObject({ conclusao: "Texto preservado", status: "REALIZADA", relatorioAnexo: { url, nome: "Relatório.pdf", tamanho: 2048 } });
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "ANEXAR_RELATORIO_AUDITORIA", diff: expect.objectContaining({ antes: null, depois: expect.objectContaining({ url }) }) }) }));
});
it.each([["Unauthorized", 401], ["Forbidden", 403]])("recusa acesso %s", async (erro, status) => {
  mocks.role.mockRejectedValue(new Error(erro));
  expect((await enviar()).status).toBe(status);
  expect(mocks.update).not.toHaveBeenCalled();
});
it.each(["https://externo.example/relatorio.pdf", "javascript:alert(1)", "https://exemplo.public.blob.vercel-storage.com/qualidade/auditorias/outra/relatorio.pdf"])("recusa endereço fora do vínculo: %s", async (endereco) => {
  expect((await enviar({ url: endereco, nome: "Relatório.pdf" })).status).toBe(400);
  expect(mocks.head).not.toHaveBeenCalled();
});
it.each([["text/html", 2048], ["application/pdf", 51 * 1024 * 1024], ["application/pdf", 0]])("recusa arquivo inválido (%s, %s bytes)", async (contentType, size) => {
  mocks.head.mockResolvedValue({ url, contentType, size });
  expect((await enviar()).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("não salva quando o arquivo não está disponível no Blob", async () => {
  mocks.head.mockRejectedValue(new Error("Blob not found"));
  expect((await enviar()).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("retorna 404 se a auditoria não existe", async () => {
  mocks.findUnique.mockResolvedValue(null);
  expect((await enviar()).status).toBe(404);
});
it("substitui o relatório sem reabrir uma auditoria finalizada", async () => {
  registro.status = "FINALIZADO";
  registro.relatorioAnexo = { url: "anterior", nome: "Anterior.pdf" };
  expect((await enviar()).status).toBe(200);
  expect(registro.status).toBe("FINALIZADO");
  expect(registro.relatorioAnexo.url).toBe(url);
});
it("preserva uma emissão feita enquanto o Blob estava sendo validado", async () => {
  mocks.head.mockImplementation(async () => {
    registro.status = "EMITIDO";
    return { url, contentType: "application/pdf", size: 2048 };
  });
  expect((await enviar()).status).toBe(200);
  expect(registro.status).toBe("EMITIDO");
});
