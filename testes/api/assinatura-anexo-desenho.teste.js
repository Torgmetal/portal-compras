import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", email: "q@torg.com.br" }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/email-layout", () => ({ cabecalhoEmail: () => "" }));
vi.mock("@/lib/databook-assinaturas", () => ({ baseUrlDe: () => "http://localhost" }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn().mockResolvedValue({}) }));
const baixarDesenho = vi.fn().mockResolvedValue(Buffer.from("%PDF"));
vi.mock("@/lib/relatorio-dimensional", () => ({ baixarDesenho: (...a) => baixarDesenho(...a) }));
const gerar = vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
vi.mock("@/lib/relatorio-render", () => ({ gerarPDFdoRelatorio: (...a) => gerar(...a) }));
import { POST } from "@/app/api/qualidade/inspecoes/[id]/assinatura/route";

// O ANEXO DO E-MAIL DE ASSINATURA SAÍA SEM O DESENHO (varredura de 23/09/2026): a pré-montagem
// RPM-103-001 chegava ao cliente com 2 folhas contra 3 no portal — sem a vista cotada, que é onde
// ele confere as medidas. A tela e o link passavam ao gerador a função que baixa o desenho; o e-mail
// não passava.

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue({
    id: "r1", codigo: "RPM-103-001", tipo: "PRE_MONTAGEM", opNumero: "103", envioAssinaturaId: "env1",
    emitidoEm: new Date(), desenhos: [{ caminho: "/OP-103/2.5.2/T103A1.pdf" }], marcas: ["T103A1"], resultados: {}, linhas: [],
  });
  mockPrisma.fotoInspecao.findMany.mockResolvedValue([]);
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
  mockPrisma.assinaturaDocumento.create.mockResolvedValue({});
  mockPrisma.oP.findFirst.mockResolvedValue({ cliente: "TMSA", obra: "Bianchini", refCliente: null });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

it("o anexo é gerado com o desenho de fabricação, como na tela", async () => {
  const r = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ destinatarios: [{ nome: "Davi Pinho", email: "pinho.davi@tmsa.ind.br", papel: "Cliente" }] }) }), { params: Promise.resolve({ id: "r1" }) });
  expect(r.status).toBe(200);
  const args = gerar.mock.calls[0][0];
  expect(typeof args.desenhoBytes).toBe("function");
  await args.desenhoBytes({ caminho: "/OP-103/2.5.2/T103A1.pdf" });
  expect(baixarDesenho).toHaveBeenCalledWith("/OP-103/2.5.2/T103A1.pdf");
});
