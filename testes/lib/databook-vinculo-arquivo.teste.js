import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { vincularNoDataBook } from "@/lib/relatorio-inspecao";

// ⚠⚠ RENOMEAR NÃO PODE APAGAR O ARQUIVO. Achado da varredura de 23/09/2026: editar o título de um
// relatório chama `vincularNoDataBook(rel, null)` só para o nome do documento acompanhar — e esse
// null era gravado em `arquivoUrl`, soltando o PDF do data book até alguém reenviar para assinatura.
// Enquanto relatório enviado era somente leitura isso não acontecia; desde 22/09 ele é editável.

const REL = { id: "r1", codigo: "RIP-103-002", tipo: "PINTURA", opNumero: "103", titulo: "Pintura galeria", emitidoEm: new Date("2026-09-21"), documentoId: "doc1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.dataBookQualidade.findFirst.mockResolvedValue({ id: "db1", status: "EM_ELABORACAO" });
  mockPrisma.dataBookSecao.findFirst.mockResolvedValue({ id: "s14", titulo: "Tratamento de superfície e pintura", estado: "ANEXADO" });
  mockPrisma.documentoQualidade.update.mockResolvedValue({});
  mockPrisma.dataBookSecaoDoc.createMany.mockResolvedValue({ count: 0 });
  // desde 25/09 o vínculo confere as assinaturas e as rodadas encerradas antes de pôr no livro —
  // ver testes/lib/databook-relatorio-assinado.teste.js
  mockPrisma.documentoQualidade.findMany.mockResolvedValue([]);
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
  mockPrisma.dataBookSecaoDoc.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.dataBookSecaoDoc.count.mockResolvedValue(1);
});

it("atualizar só o nome mantém o arquivo que já está vinculado", async () => {
  await vincularNoDataBook(REL, null);
  const data = mockPrisma.documentoQualidade.update.mock.calls[0][0].data;
  expect(data.nome).toContain("RIP-103-002");
  expect(Object.hasOwn(data, "arquivoUrl")).toBe(false);
});

it("o envio para assinatura continua gravando o arquivo", async () => {
  await vincularNoDataBook(REL, "https://portal/api/qualidade/inspecoes/r1/pdf");
  expect(mockPrisma.documentoQualidade.update.mock.calls[0][0].data.arquivoUrl).toBe("https://portal/api/qualidade/inspecoes/r1/pdf");
});

it("documento novo nasce sem arquivo, como sempre", async () => {
  mockPrisma.documentoQualidade.create.mockResolvedValue({ id: "doc2" });
  mockPrisma.relatorioInspecao.update.mockResolvedValue({});
  await vincularNoDataBook({ ...REL, documentoId: null }, null);
  expect(mockPrisma.documentoQualidade.create.mock.calls[0][0].data.arquivoUrl).toBe(null);
});
