// "Baixar PDF" do data book da OP-112 caía em 504 (Geraldo, 30/09/2026). A rota agora dá ao gerador
// um orçamento de tempo e de tamanho; o livro que não cabe vira AVISO para gerar em volumes — numa
// página legível quando quem abriu foi o botão (aba nova), em JSON quando é código.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/databook-pdf", () => ({ gerarDataBookPDF: vi.fn(), DATABOOK_GRANDE_DEMAIS: "DATABOOK_GRANDE_DEMAIS" }));
vi.mock("@/lib/databook-volumes", () => ({ montarRoteiro: vi.fn(async () => ({ roteiro: [] })) }));

import { GET, maxDuration } from "@/app/api/qualidade/data-books/[id]/pdf/route";
import { gerarDataBookPDF } from "@/lib/databook-pdf";
import { montarRoteiro } from "@/lib/databook-volumes";

const pedir = (qs = "", id = "b112") => GET(new Request(`http://x/api/qualidade/data-books/${id}/pdf${qs}`), { params: { id } });
const grandeDemais = () => Object.assign(new Error("não cabe"), { codigo: "DATABOOK_GRANDE_DEMAIS", info: { anexos: 264, mb: 86 } });

beforeEach(() => {
  vi.clearAllMocks();
  montarRoteiro.mockResolvedValue({ roteiro: [] });
  mockPrisma.dataBookArquivo.count.mockResolvedValue(0);
});

describe("PDF do data book em arquivo único", () => {
  it("dá 5 minutos à função — o padrão da plataforma, e não os 120 s que o livro estourava", () => {
    expect(maxDuration).toBe(300);
  });

  it("passa ao gerador um orçamento de tempo (dentro da função) e de tamanho", async () => {
    gerarDataBookPDF.mockResolvedValue({ bytes: new Uint8Array([37, 80, 68, 70]), filename: "Data Book OP-112.pdf" });
    const antes = Date.now();
    await pedir();
    const [id, opts] = gerarDataBookPDF.mock.calls[0];
    expect(id).toBe("b112");
    expect(opts.orcamento.ateMs).toBeGreaterThan(antes);
    expect(opts.orcamento.ateMs).toBeLessThan(antes + 300_000);
    expect(opts.orcamento.maxBytes).toBeGreaterThan(86 * 1024 * 1024); // o da OP-112 tem 86 MB e cabe
  });

  it("o PDF sai em partes (streaming): resposta inteira acima de 4,5 MB a Vercel recusa", async () => {
    const bytes = new Uint8Array(3 * 1024 * 1024 + 7).map((_, i) => i % 251);
    gerarDataBookPDF.mockResolvedValue({ bytes, filename: "Data Book OP-112 (rascunho).pdf" });
    const r = await pedir("?inline=1");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toMatch(/^inline/);
    const leitor = r.body.getReader();
    const partes = [];
    for (;;) { const { done, value } = await leitor.read(); if (done) break; partes.push(value); }
    expect(partes.length).toBeGreaterThan(1);
    const junto = Buffer.concat(partes.map((p) => Buffer.from(p)));
    expect(junto.equals(Buffer.from(bytes))).toBe(true);
  });

  it("livro que não coube, chamado por código: 409 em JSON dizendo para gerar em volumes", async () => {
    gerarDataBookPDF.mockRejectedValue(grandeDemais());
    const r = await pedir();
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.emVolumes).toBe(true);
    expect(j.error).toMatch(/264 anexos/);
    expect(j.detalhe).toMatch(/Gerar volumes/);
  });

  it("livro que não coube, aberto pelo botão: a aba mostra o aviso numa página, não JSON cru", async () => {
    gerarDataBookPDF.mockRejectedValue(grandeDemais());
    const r = await pedir("?inline=1");
    expect(r.status).toBe(409);
    expect(r.headers.get("content-type")).toMatch(/^text\/html/);
    const html = await r.text();
    expect(html).toContain("Gerar volumes");
    expect(html).toContain("264 anexos");
    expect(html).toContain('href="/qualidade/data-books/b112"');
  });

  it("com volumes já gerados, o aviso aponta para eles", async () => {
    gerarDataBookPDF.mockRejectedValue(grandeDemais());
    mockPrisma.dataBookArquivo.count.mockResolvedValue(4);
    const j = await (await pedir()).json();
    expect(j.detalhe).toMatch(/volumes já gerados/);
  });

  it("o id do caminho não entra cru na página (nada de HTML injetado pelo endereço)", async () => {
    gerarDataBookPDF.mockRejectedValue(grandeDemais());
    const html = await (await pedir("?inline=1", '"><script>alert(1)</script>')).text();
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("acima de 300 anexos nem tenta gerar (a recusa vem na hora)", async () => {
    montarRoteiro.mockResolvedValue({ roteiro: Array.from({ length: 301 }, () => ({})) });
    const r = await pedir();
    expect(r.status).toBe(409);
    expect(gerarDataBookPDF).not.toHaveBeenCalled();
  });

  it("outra falha continua sendo 500 com o motivo", async () => {
    gerarDataBookPDF.mockRejectedValue(new Error("Data book não encontrado"));
    const r = await pedir();
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/Data book não encontrado/);
  });
});
