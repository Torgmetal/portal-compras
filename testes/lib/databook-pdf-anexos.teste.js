// O PDF do data book da OP-112 dava 504 (Geraldo, 30/09/2026): os 264 anexos vinham do SharePoint
// UM POR VEZ. Agora vêm vários ao mesmo tempo — e o que não pode mudar é a ORDEM em que entram no
// livro, nem a regra de que anexo que falha vira pendência escrita (nunca some em silêncio).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractText } from "unpdf";
import { mockPrisma } from "../apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/databook-ficha-r", () => ({ fichasPorR: async () => new Map(), comFicha: (d) => ({ ...d }) }));
vi.mock("@/lib/databook-arquivo", () => ({ resolverDriveServidor: async () => null, baixarDocumento: vi.fn() }));
vi.mock("@/lib/databook-lpc", () => ({ montarSecaoLpc: async () => ({ conjuntos: [] }) }));
vi.mock("@/lib/relatorio-form-pdf", () => ({ imagemAssinada: vi.fn() }));
import { gerarDataBookPDF } from "../../lib/databook-pdf";
import { baixarDocumento } from "@/lib/databook-arquivo";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const N = 12;
const docs = Array.from({ length: N }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return { id: `d${n}`, nome: `Certificado ${n}`, arquivoNome: `cert-${n}.pdf`, arquivoUrl: `https://exemplo.public.blob.vercel-storage.com/cert-${n}.pdf`, origem: "anexo_databook", categoria: "DOCUMENTO" };
});
const book = {
  id: "b112", opNumero: "112", cliente: "Cliente de teste", obra: "Obra de teste", revisao: 0, status: "EM_MONTAGEM", templateVisual: "TORG_2026",
  secoes: [{ id: "s04", numero: "04", titulo: "Certificados", estado: "ANEXADO", ordem: 4, fonte: "manual", documentos: docs.map((d) => ({ documentoId: d.id })) }],
  assinaturas: [],
};

const pdfs = {};
beforeEach(async () => {
  vi.clearAllMocks();
  mockPrisma.dataBookQualidade.findUnique.mockResolvedValue(book);
  mockPrisma.documentoQualidade.findMany.mockResolvedValue(docs);
  mockPrisma.oP.findFirst.mockResolvedValue({ referencias: [] });
  for (const d of docs) {
    if (pdfs[d.id]) continue;
    const p = await PDFDocument.create();
    const font = await p.embedFont(StandardFonts.Helvetica);
    p.addPage([400, 600]).drawText(`ANEXO-${d.id}`, { x: 50, y: 500, size: 20, font });
    pdfs[d.id] = Buffer.from(await p.save());
  }
});

const textoDo = async (bytes) => (await extractText(new Uint8Array(bytes), { mergePages: true })).text;

describe("anexos do data book em arquivo único", () => {
  it("baixa vários ao mesmo tempo (no máximo 8) e mantém a ordem do livro", async () => {
    let noAr = 0, pico = 0;
    baixarDocumento.mockImplementation(async (d) => {
      noAr++; pico = Math.max(pico, noAr);
      // os primeiros demoram mais: terminariam por último se a ordem fosse a da chegada
      await espera((N - Number(d.id.slice(1))) * 4);
      noAr--;
      return pdfs[d.id];
    });
    const out = await gerarDataBookPDF("b112");
    expect(pico).toBeGreaterThan(1);
    expect(pico).toBeLessThanOrEqual(8);
    const texto = await textoDo(out.bytes);
    const posicoes = docs.map((d) => texto.indexOf(`ANEXO-${d.id}`));
    expect(posicoes.every((p) => p >= 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    expect(out.pendencias).toEqual([]);
  });

  it("anexo que falha continua virando pendência escrita, e os outros entram", async () => {
    baixarDocumento.mockImplementation(async (d) => {
      if (d.id === "d05") throw new Error("Falha ao baixar item X: HTTP 404");
      return pdfs[d.id];
    });
    const out = await gerarDataBookPDF("b112");
    expect(out.pendencias.map((p) => p.nome)).toEqual(["Certificado 05"]);
    const texto = await textoDo(out.bytes);
    expect(texto).toContain("ANEXO-d04");
    expect(texto).toContain("ANEXO-d06");
  });

  it("estourou o tempo: para e avisa que não cabe num arquivo só — nada de PDF pela metade", async () => {
    baixarDocumento.mockImplementation(async (d) => pdfs[d.id]);
    await expect(gerarDataBookPDF("b112", { orcamento: { ateMs: Date.now() - 1 } }))
      .rejects.toMatchObject({ codigo: "DATABOOK_GRANDE_DEMAIS" });
  });

  it("estourou o tamanho: mesma recusa, dizendo quantos anexos o livro tem", async () => {
    baixarDocumento.mockImplementation(async (d) => pdfs[d.id]);
    const erro = await gerarDataBookPDF("b112", { orcamento: { maxBytes: 1 } }).catch((e) => e);
    expect(erro.codigo).toBe("DATABOOK_GRANDE_DEMAIS");
    expect(erro.info.anexos).toBe(N);
  });

  it("sem orçamento (aceite e assinatura do cliente) o livro sai inteiro, como antes", async () => {
    baixarDocumento.mockImplementation(async (d) => pdfs[d.id]);
    const out = await gerarDataBookPDF("b112");
    const texto = await textoDo(out.bytes);
    for (const d of docs) expect(texto).toContain(`ANEXO-${d.id}`);
  });
});
