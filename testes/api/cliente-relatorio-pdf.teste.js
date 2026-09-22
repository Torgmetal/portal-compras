import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
const requireUser = vi.fn();
vi.mock("@/lib/session", () => ({ requireUser: (...a) => requireUser(...a) }));
const pdfDoRelatorio = vi.fn();
vi.mock("@/lib/relatorio-pdf-fonte", () => ({ pdfDoRelatorio: (...a) => pdfDoRelatorio(...a) }));
import { GET } from "@/app/api/cliente/relatorio/[id]/pdf/route";

// O PDF do relatório fechado, para quem tem a obra liberada. Sem token: quem pergunta é a sessão.

const CONTATOS = [{ nome: "Renato Massano", email: "massano.renato@gmail.com" }];
const TORG = { assinadoEm: new Date("2026-09-21") }, DAVI = { assinadoEm: new Date("2026-09-23") };
const rel = (assinaturas, status = "CONCLUIDO") => ({
  id: "rel1", codigo: "RPM-105-002", opNumero: "105",
  envioAssinatura: { id: "env1", status, titulo: "RPM-105-002 · OP-105", assinaturas },
});
const chamar = () => GET(new Request("http://localhost"), { params: { id: "rel1" } });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u", email: "massano.renato@gmail.com" });
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel([TORG, DAVI]));
  mockPrisma.oP.findFirst.mockResolvedValue({ clienteEmail: "rogerio.porsch@tmsa.ind.br", clienteContatos: CONTATOS });
  pdfDoRelatorio.mockResolvedValue({ bytes: Buffer.from("%PDF-1.7 fake"), nome: "RPM-105-002.pdf" });
});

it("entrega o PDF para o contato da obra, sem deixar cache pelo caminho", async () => {
  const r = await chamar();
  expect(r.status).toBe(200);
  expect(r.headers.get("Content-Type")).toBe("application/pdf");
  expect(r.headers.get("Cache-Control")).toContain("no-store");
  // ⚠ o PDF é conferido contra a OBRA que autorizou: id de relatório de outra obra não passa
  expect(pdfDoRelatorio).toHaveBeenCalledWith("rel1", expect.objectContaining({ exigirOp: "105" }));
});

it("enquanto falta assinatura, ninguém consulta", async () => {
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel([TORG, { assinadoEm: null }], "EM_ANDAMENTO"));
  expect((await chamar()).status).toBe(403);
  expect(pdfDoRelatorio).not.toHaveBeenCalled();
});

it("devolvido para revisão também não", async () => {
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel([TORG, DAVI], "REVISAO_PEDIDA"));
  expect((await chamar()).status).toBe(403);
});

it("quem não está na obra não lê o documento dela", async () => {
  requireUser.mockResolvedValue({ id: "u2", email: "alguem@outra.com" });
  expect((await chamar()).status).toBe(403);
  expect(pdfDoRelatorio).not.toHaveBeenCalled();
});

it("sem sessão é 401; relatório que não existe é 404", async () => {
  requireUser.mockRejectedValue(new Error("Unauthorized"));
  expect((await chamar()).status).toBe(401);
  requireUser.mockResolvedValue({ id: "u", email: "massano.renato@gmail.com" });
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(null);
  expect((await chamar()).status).toBe(404);
});
