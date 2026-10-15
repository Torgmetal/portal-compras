// O PDF do FOR-081 sai da própria planilha preenchida (lib/romaneio-tmsa-pdf.js): A4 paisagem, uma página para o romaneio
// comum e, com muitos volumes, páginas seguintes repetindo o cabeçalho da tabela (linhas 6–8, como o modelo imprime).
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { gerarRomaneioTmsaExcel } from "@/lib/romaneio-tmsa-excel";
import { gerarRomaneioTmsaPdf } from "@/lib/romaneio-tmsa-pdf";

const romaneio = (n) => ({
  numero: 1, data: new Date("2026-10-15T12:00:00Z"), referencia: "TPR00751 / OP-122",
  totais: { kgLiquido: 10 * n, kgBruto: 12 * n, embalagens: n },
  embalagens: Array.from({ length: n }, (_, i) => ({ numero: i + 1, tipo: `VOLUME ${i + 1}`, dims: [100, 50, 40], kgLiquido: 10, kgBruto: 12, linhas: [{ tag: "TC 1", qtd: 1, codigo: "231297-1", descricao: `VIGA — M${i}` }] })),
});
async function paginas(n) {
  const pdf = await PDFDocument.load(await gerarRomaneioTmsaPdf(await gerarRomaneioTmsaExcel(romaneio(n))));
  return pdf.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
}

describe("PDF do FOR-081", () => {
  it("A4 paisagem, uma página com as 16 linhas do modelo", async () => {
    expect(await paginas(3)).toEqual([[842, 595]]);
  });
  it("muitos volumes: continua em mais páginas", async () => {
    expect((await paginas(60)).length).toBeGreaterThan(1);
  });
});
