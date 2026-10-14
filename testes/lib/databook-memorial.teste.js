// Memorial de cálculo na §03 (Vitor, 14/10/2026): "pode ser na seção 3, porém temos obras que terá o
// memorial e outros não terá" — o nome da seção acompanha: "ARTs e memorial de cálculo" só quando há
// memorial anexado. Livro emitido não muda.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
import { ehMemorial, tituloDaSecao03, TITULO_03, TITULO_03_COM_MEMORIAL, sincronizarTitulo03 } from "@/lib/databook-memorial";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/sharepoint", () => ({ listChildrenByPath: vi.fn() }));
vi.mock("@/lib/projetos-databook", () => ({ resolveServidorDriveId: vi.fn() }));
import { SECAO_PASTAS } from "@/lib/databook-pastas";
import { SECOES_DATABOOK } from "@/lib/databook-secoes";
const SECOES_DATABOOK_TITULO = Object.fromEntries(SECOES_DATABOOK.map((s) => [s.numero, s.titulo]));

beforeEach(() => vi.clearAllMocks());

describe("o que é memorial", () => {
  it("pelo nome do arquivo, com e sem acento", () => {
    expect(ehMemorial({ nome: "MC-112-R02 Memorial de Cálculo.pdf" })).toBe(true);
    expect(ehMemorial({ nome: "Memoria de calculo rev B" })).toBe(true);
    expect(ehMemorial({ nome: "ART 2620250012345.pdf" })).toBe(false);
  });
});

describe("o nome da §03", () => {
  it("sem memorial fica o de sempre; com memorial, ARTs e memorial de cálculo", () => {
    expect(tituloDaSecao03([{ nome: "ART projeto.pdf" }])).toBe(TITULO_03);
    expect(tituloDaSecao03([{ nome: "ART projeto.pdf" }, { nome: "Memorial de cálculo.pdf" }])).toBe(TITULO_03_COM_MEMORIAL);
    expect(TITULO_03).toBe(SECOES_DATABOOK_TITULO["03"]);
  });

  it("grava o nome novo na §03 de livro aberto quando muda", async () => {
    mockPrisma.dataBookSecao.findFirst.mockResolvedValue({ id: "s03", titulo: TITULO_03, documentos: [{ documentoId: "d1" }] });
    mockPrisma.documentoQualidade.findMany.mockResolvedValue([{ id: "d1", nome: "Memorial de Cálculo R01.pdf" }]);
    mockPrisma.dataBookSecao.update.mockResolvedValue({});
    const t = await sincronizarTitulo03(mockPrisma, { id: "b1", status: "EM_MONTAGEM", emitidoEm: null });
    expect(t).toBe(TITULO_03_COM_MEMORIAL);
    expect(mockPrisma.dataBookSecao.update).toHaveBeenCalledWith({ where: { id: "s03" }, data: { titulo: TITULO_03_COM_MEMORIAL } });
  });

  it("memorial retirado: volta ao nome de sempre", async () => {
    mockPrisma.dataBookSecao.findFirst.mockResolvedValue({ id: "s03", titulo: TITULO_03_COM_MEMORIAL, documentos: [] });
    mockPrisma.documentoQualidade.findMany.mockResolvedValue([]);
    await sincronizarTitulo03(mockPrisma, { id: "b1", status: "EM_MONTAGEM", emitidoEm: null });
    expect(mockPrisma.dataBookSecao.update).toHaveBeenCalledWith({ where: { id: "s03" }, data: { titulo: TITULO_03 } });
  });

  it("sem mudança não grava; livro emitido nem é lido", async () => {
    mockPrisma.dataBookSecao.findFirst.mockResolvedValue({ id: "s03", titulo: TITULO_03, documentos: [] });
    mockPrisma.documentoQualidade.findMany.mockResolvedValue([]);
    await sincronizarTitulo03(mockPrisma, { id: "b1", status: "EM_MONTAGEM", emitidoEm: null });
    expect(mockPrisma.dataBookSecao.update).not.toHaveBeenCalled();
    await sincronizarTitulo03(mockPrisma, { id: "b2", status: "ACEITO", emitidoEm: new Date() });
    expect(mockPrisma.dataBookSecao.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("a §03 navega também na pasta do memorial", () => {
  it("2.2 Memória de Cálculo e 2.5.5 › Memorial de Cálculo e ART", () => {
    const labels = SECAO_PASTAS["03"].caminhos.map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["ART", "Memorial de cálculo", "Memorial (pasta do cliente)"]));
    const memorial = SECAO_PASTAS["03"].caminhos.find((c) => c.label === "Memorial de cálculo").niveis;
    expect(memorial[0].test("2. Engenharia")).toBe(true);
    expect(memorial[1].test("2.2 Memória de Cálculo")).toBe(true);
    expect(memorial[1].test("2.25 Outra")).toBe(false);
  });
});
