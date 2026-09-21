import { describe, it, expect, vi, beforeEach } from "vitest";

// ⚠⚠ UM QR POR MARCA, NÃO POR ETIQUETA — e isto era um 504 em produção (14/09/2026). O QR codifica
// a MARCA, então as 110 etiquetas da mesma marca carregavam 110 imagens IDÊNTICAS: 110 gerações de
// PNG e 110 `embedPng`, cada um virando um objeto novo dentro do arquivo.
//
// Medido na OP-105, com 1.793 etiquetas: 29,3s e 10,3 MB ANTES; 3,3s e 2,7 MB DEPOIS. Nove vezes
// mais rápido e quatro vezes menor — e a função da Vercel deixou de morrer antes de terminar.

// ⚠ Um PNG 1×1 de verdade: o `pdf-lib` valida a assinatura do arquivo, e um buffer inventado
// falha com "The input is not a PNG file!" antes de o teste chegar ao que interessa.
const PNG = vi.hoisted(() => Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"));
const qr = vi.hoisted(() => vi.fn(async () => PNG));
vi.mock("qrcode", () => ({ default: { toBuffer: qr } }));

const { gerarEtiquetasCarregamentoPDF } = await import("@/lib/etiqueta-carregamento-pdf");

const peca = (marca, qte, extra = {}) => ({ marca, qte, descricao: "TRAVAMENTO", pesoUnitKg: 4.4, ...extra });
const gerar = (pecas) => gerarEtiquetasCarregamentoPDF({
  cliente: "TMSA", obra: "Bianchini", opNumero: "105", pecas, modelo: "padrao",
});

beforeEach(() => qr.mockClear());

describe("o QR de cada marca é gerado uma vez só", () => {
  it("marca com 110 peças gera UM QR, não 110", async () => {
    await gerar([peca("105A19", 110)]);
    expect(qr).toHaveBeenCalledTimes(1);
  });

  it("cada marca tem o seu — e o conteúdo é a marca", async () => {
    await gerar([peca("105A1", 3), peca("105A2", 4)]);
    expect(qr).toHaveBeenCalledTimes(2);
    expect(qr.mock.calls.map((c) => c[0])).toEqual(["105A1", "105A2"]);
  });

  // ⚠ A caixa sai com UMA etiqueta; um QR continua sendo um QR.
  it("marca em caixa também gera um só", async () => {
    await gerar([peca("105A19", 50, { emCaixa: true })]);
    expect(qr).toHaveBeenCalledTimes(1);
  });

  // ⚠ O PDF tem de continuar com uma PÁGINA por peça — economizar QR não pode economizar etiqueta.
  it("o número de páginas não muda: uma por peça", async () => {
    const bytes = await gerar([peca("105A1", 3), peca("105A2", 4)]);
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(7);
  });

  // ⚠ E a marca em caixa continua rendendo UMA página para o lote inteiro.
  it("a caixa continua sendo uma página só", async () => {
    const bytes = await gerar([peca("105A19", 50, { emCaixa: true })]);
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
