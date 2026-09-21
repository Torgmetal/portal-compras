import { beforeEach, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/pit-acesso", () => ({
  requireGestaoPit: vi.fn().mockResolvedValue({ id: "qualidade-1" }),
  requireConsultaPit: vi.fn(),
  podeGerenciarPit: vi.fn(),
}));

import { PUT } from "@/app/api/qualidade/pit/[opNumero]/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.oP.findFirst.mockResolvedValue({ id: "op-102", pitPadrao: null });
  mockPrisma.oP.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.dataBookQualidade.findUnique.mockResolvedValue({
    secoes: [{ id: "secao-10", conteudoJson: null }],
  });
  mockPrisma.dataBookSecao.update.mockResolvedValue({});
  mockPrisma.documentoQualidade.findFirst.mockResolvedValue(null);
  mockPrisma.documentoQualidade.create.mockResolvedValue({ id: "doc-pit-102" });
  mockPrisma.dataBookSecaoDoc.upsert.mockResolvedValue({});
});

it("salvar o PIT da OP também preenche e conclui a seção 10 do Data Book existente", async () => {
  const req = new Request("http://localhost/api/qualidade/pit/102", {
    method: "PUT",
    body: JSON.stringify({ padrao: "SNQC", revisao: "0" }),
  });

  expect((await PUT(req, { params: Promise.resolve({ opNumero: "102" }) })).status).toBe(200);
  expect(mockPrisma.dataBookSecao.update).toHaveBeenCalledWith({
    where: { id: "secao-10" },
    data: {
      estado: "ANEXADO",
      conteudoJson: expect.objectContaining({ origem: "OP", padrao: "SNQC", revisao: "0", itens: expect.any(Array) }),
    },
  });
  expect(mockPrisma.dataBookSecao.update.mock.calls[0][0].data.conteudoJson.itens).toHaveLength(15);
  expect(mockPrisma.documentoQualidade.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      nome: "Plano de Inspeção e Testes T102-R00",
      opNumero: "102",
      origem: "pit_portal",
      arquivoUrl: "/api/qualidade/planos/102/pdf?doc=PIT",
      arquivoNome: "PIT-T102-R00.pdf",
      arquivoTipo: "application/pdf",
      validado: true,
    }),
  });
  expect(mockPrisma.dataBookSecaoDoc.upsert).toHaveBeenCalledWith({
    where: { secaoId_documentoId: { secaoId: "secao-10", documentoId: "doc-pit-102" } },
    create: { secaoId: "secao-10", documentoId: "doc-pit-102" },
    update: {},
  });
});
