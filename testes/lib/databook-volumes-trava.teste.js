// OP-112 (01/10/2026): o Geraldo pediu os volumes, a barra ficou um minuto parada em "0 / 264" e
// alguém pediu de novo no meio. O portal montou o Volume 3 DUAS VEZES ao mesmo tempo — a segunda
// gravou por cima da primeira, 49 MB ficaram órfãos no storage e o total de páginas do job saiu
// inflado. Desta vez o conjunto final fechou certo por sorte da ordem das gravações.
// Agora uma geração por data book de cada vez: quem chega com a vez tomada só acompanha.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "../apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("@/lib/databook-arquivo", () => ({ baixarDocumento: vi.fn(), resolverDriveServidor: vi.fn(async () => null) }));
vi.mock("@/lib/databook-pdf", () => ({ gerarDataBookPDF: vi.fn() }));
import { processarGeracao } from "@/lib/databook-volumes";
import { baixarDocumento } from "@/lib/databook-arquivo";

const job = { id: "g1", dataBookId: "b112", revisao: 0, status: "GERANDO", cursor: 130, volumeAtual: 2, iniciadoEm: new Date() };
// `$queryRaw` é chamado como template: (partes, ...valores) — o 1º valor é a chave da vez
const chaveDaVez = () => mockPrisma.$queryRaw.mock.calls[0]?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.dataBookGeracao.findUnique.mockResolvedValue(job);
});

describe("geração de volumes: uma por vez", () => {
  it("com a vez tomada por outra janela, não monta nada — devolve 'ocupado'", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ faltam: 40 }]);
    const r = await processarGeracao("g1");
    expect(r).toMatchObject({ ocupado: true });
    expect(mockPrisma.dataBookGeracao.update).not.toHaveBeenCalled();
    expect(mockPrisma.dataBookArquivo.upsert).not.toHaveBeenCalled();
    expect(baixarDocumento).not.toHaveBeenCalled();
  });

  it("a vez é do DATA BOOK, não do job: dois jobs do mesmo livro também não rodam juntos", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ faltam: 40 }]);
    await processarGeracao("g1");
    expect(chaveDaVez()).toBe("databook-volumes:b112");
  });

  it("com a vez livre, trabalha e devolve a vez no fim", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ travadoAte: new Date() }]);
    mockPrisma.dataBookGeracao.findUnique.mockResolvedValue({ ...job, status: "CONCLUIDO" });
    const r = await processarGeracao("g1");
    expect(r).toMatchObject({ concluido: true });
    // soltarVez: UPDATE ... "travadoAte" = NULL WHERE "job" = <chave>
    const solta = mockPrisma.$executeRaw.mock.calls.find((c) => String(c[0].join("")).includes('"travadoAte" = NULL'));
    expect(solta?.[1]).toBe("databook-volumes:b112");
  });

  it("job que não existe continua sendo erro, e não 'ocupado'", async () => {
    mockPrisma.dataBookGeracao.findUnique.mockResolvedValue(null);
    await expect(processarGeracao("nao-existe")).rejects.toThrow(/não encontrada/);
  });
});
