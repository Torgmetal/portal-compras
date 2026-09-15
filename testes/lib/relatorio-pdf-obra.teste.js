// A amarração DOCUMENTO ↔ RELATÓRIO ↔ OBRA, em `pdfDoRelatorio`.
//
// ⚠⚠ POR QUE ISTO É SEGURANÇA E NÃO ZELO: `lib/databook-arquivo.js` alimenta o PORTAL DO CLIENTE
// (`/api/portal/[token]/doc`), onde o documento é filtrado pela obra do token — mas o relatório
// para onde o `arquivoUrl` dele aponta não era. Um anexo da obra A apontando para um relatório da
// obra B entregaria ao cliente A um documento da obra B. Achado do parecer de segurança do Codex
// (15/09/2026).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/assinatura-cadastro", () => ({ completarImagens: vi.fn(async (x) => x) }));
vi.mock("@/lib/relatorio-dimensional", () => ({ baixarDesenho: vi.fn(), garantirDesenhos: vi.fn(async () => []) }));
vi.mock("@/lib/qualidade-campo", () => ({ usaCotas: () => false }));
vi.mock("@/lib/relatorio-render", () => ({ gerarPDFdoRelatorio: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

import { pdfDoRelatorio } from "@/lib/relatorio-pdf-fonte";
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";

const relatorio = { id: "rel1", codigo: "RIP-106-002", tipo: "PINTURA", opNumero: "106", revisoes: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(relatorio);
  mockPrisma.fotoInspecao.findMany.mockResolvedValue([]);
  mockPrisma.oP.findFirst.mockResolvedValue({ cliente: "TMSA", obra: "Torocua", refCliente: "X" });
});

describe("pdfDoRelatorio — a obra do anexo tem de ser a obra do relatório", () => {
  it("monta o PDF quando a obra bate", async () => {
    const pdf = await pdfDoRelatorio("rel1", { exigirOp: "106" });
    expect(pdf.nome).toBe("RIP-106-002.pdf");
    expect(gerarPDFdoRelatorio).toHaveBeenCalledTimes(1);
  });

  it("RECUSA quando o anexo é de outra obra — e não chega a montar nada", async () => {
    await expect(pdfDoRelatorio("rel1", { exigirOp: "089" }))
      .rejects.toMatchObject({ status: 409, message: /outra obra/ });
    expect(gerarPDFdoRelatorio).not.toHaveBeenCalled();
  });

  // ⚠ "106" e 106 são a mesma obra: o número vem de `String?` no documento e pode chegar dos dois
  // jeitos conforme a porta de entrada. Recusar por causa do tipo seria derrubar anexo legítimo.
  it("compara como texto — número e string da mesma obra passam", async () => {
    await expect(pdfDoRelatorio("rel1", { exigirOp: 106 })).resolves.toBeTruthy();
  });

  // ⚠ A rota do próprio relatório (`/api/qualidade/inspecoes/[id]/pdf`) não tem documento nenhum
  // para amarrar: lá quem autoriza é o `requireRole`. Sem `exigirOp`, a conferência não se aplica.
  it("sem exigirOp, serve — é o caminho da rota do próprio relatório", async () => {
    await expect(pdfDoRelatorio("rel1")).resolves.toBeTruthy();
  });

  it("relatório inexistente é 404, não 409", async () => {
    mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(null);
    await expect(pdfDoRelatorio("sumiu", { exigirOp: "106" })).rejects.toMatchObject({ status: 404 });
  });

  it("revisão pedida que não existe no snapshot é 404 com o número na mensagem", async () => {
    await expect(pdfDoRelatorio("rel1", { revisao: 3, exigirOp: "106" }))
      .rejects.toMatchObject({ status: 404, message: /R03/ });
  });
});
