// A última assinatura é que põe o relatório de inspeção no data book (Vitor, 25/09/2026: "puxar
// apenas os que estiverem assinados"). Antes disso ele não entra; e falhar ao vincular não pode
// desfazer nem travar a assinatura de quem acabou de assinar.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn(async () => null) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/assinatura-cadastro", () => ({ imagemDoCadastro: vi.fn(async () => null) }));
const rel = vi.hoisted(() => ({ aoConcluirAssinaturas: vi.fn() }));
vi.mock("@/lib/relatorio-inspecao", () => rel);

import { POST } from "@/app/api/assinar/[token]/route";

const ENVIO = { id: "e1", tipo: "RELATORIO_INSPECAO", status: "EM_ANDAMENTO", revisao: 0, titulo: "RIP-112-001", opNumero: "112", snapshot: { relatorioId: "rel1" } };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.assinaturaDocumento.findUnique.mockResolvedValue({ id: "a2", envioId: "e1", email: "qualidade@torg.com.br", nome: "Geraldo", ordem: null, assinadoEm: null, envio: ENVIO });
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.assinaturaDocumento.update.mockResolvedValue({ assinadoEm: new Date(), ip: null });
  mockPrisma.assinaturaDocumento.findFirst.mockResolvedValue(null);
  mockPrisma.envioAssinatura.update.mockResolvedValue({});
  rel.aoConcluirAssinaturas.mockResolvedValue({ vinculado: true });
});

const assinar = () => POST(new Request("http://x", { method: "POST", body: JSON.stringify({}) }), { params: { token: "tok" } });

describe("assinatura de relatório de inspeção", () => {
  it("a ÚLTIMA assinatura põe o relatório no data book", async () => {
    mockPrisma.assinaturaDocumento.count.mockResolvedValue(0);
    const r = await assinar();
    expect(r.status).toBe(200);
    expect(rel.aoConcluirAssinaturas).toHaveBeenCalledTimes(1);
    expect(rel.aoConcluirAssinaturas.mock.calls[0][0]).toMatchObject({ tipo: "RELATORIO_INSPECAO", snapshot: { relatorioId: "rel1" } });
  });

  it("faltando assinatura, ainda não", async () => {
    mockPrisma.assinaturaDocumento.count.mockResolvedValue(1);
    await assinar();
    expect(rel.aoConcluirAssinaturas).not.toHaveBeenCalled();
  });

  it("falhar ao vincular não derruba a assinatura", async () => {
    mockPrisma.assinaturaDocumento.count.mockResolvedValue(0);
    rel.aoConcluirAssinaturas.mockRejectedValue(new Error("P1001"));
    const r = await assinar();
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });
});
