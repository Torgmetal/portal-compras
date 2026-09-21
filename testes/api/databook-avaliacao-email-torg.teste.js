import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Geraldo" }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "x" }) }));
import { sendEmail } from "@/lib/email";
import { POST } from "@/app/api/qualidade/data-books/[id]/avaliacao-cliente/route";

// OP-089 (15/09/2026): o rascunho foi "enviado" para pinho.davi@torg.com.br — caixa que não existe.
beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.dataBookQualidade.findUnique.mockResolvedValue({ id: "db", opNumero: "089", status: "EM_MONTAGEM", revisao: 0, emitidoEm: null, avaliacaoOkEm: null });
  mockPrisma.dataBookArquivo.count.mockResolvedValue(3);
  mockPrisma.oP.findFirst.mockResolvedValue({ clienteContatos: [{ nome: "Davi Pinho", email: "pinho.davi@tmsa.ind.br" }, { nome: "José Neto", email: "jose.neto@tmsa.ind.br" }] });
});

it("recusa e-mail do cliente no domínio da Torg e sugere o contato certo da OP", async () => {
  const res = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ clienteEmail: "pinho.davi@torg.com.br", clienteNome: "Davi" }) }), { params: { id: "db" } });
  expect(res.status).toBe(400);
  const j = await res.json();
  expect(j.error).toMatch(/endereço da Torg/);
  expect(j.error).toMatch(/pinho\.davi@tmsa\.ind\.br/);
  expect(sendEmail).not.toHaveBeenCalled();
  expect(mockPrisma.portalCliente.create).not.toHaveBeenCalled();
});
