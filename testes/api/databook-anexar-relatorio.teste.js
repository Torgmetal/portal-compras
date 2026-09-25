// Anexar à mão no data book também respeita "só relatório assinado" (Vitor, 25/09/2026): o documento
// do relatório aparece na lista de candidatos da OP, e sem esta trava a regra valeria só para o automático.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1" })) }));

import { POST } from "@/app/api/qualidade/data-books/secao/[secaoId]/doc/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.dataBookSecao.findUnique.mockResolvedValue({ id: "s14", dataBook: { status: "EM_MONTAGEM", emitidoEm: null, revisao: 0 } });
  mockPrisma.documentoQualidade.findUnique.mockResolvedValue({ id: "doc-rip1", ativo: true, categoria: "RELATORIO", origem: "inspecao_campo", numeroDocumento: "RIP-112-001" });
  mockPrisma.dataBookSecaoDoc.upsert.mockResolvedValue({});
});

const anexar = () => POST(new Request("http://x", { method: "POST", body: JSON.stringify({ documentoId: "doc-rip1" }) }), { params: { secaoId: "s14" } });

describe("anexar relatório à mão", () => {
  it("rascunho é recusado, e a tela recebe o motivo", async () => {
    mockPrisma.relatorioInspecao.findFirst.mockResolvedValue({ envioAssinaturaId: null, revisoes: [] });
    const r = await anexar();
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/assinad/i);
    expect(mockPrisma.dataBookSecaoDoc.upsert).not.toHaveBeenCalled();
  });

  it("assinado por todos entra", async () => {
    mockPrisma.relatorioInspecao.findFirst.mockResolvedValue({ envioAssinaturaId: "e1", revisoes: [] });
    mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([{ assinadoEm: new Date() }, { assinadoEm: new Date() }]);
    const r = await anexar();
    expect(r.status).toBe(200);
    expect(mockPrisma.dataBookSecaoDoc.upsert).toHaveBeenCalled();
  });
});
