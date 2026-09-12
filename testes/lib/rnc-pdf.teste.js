import { afterEach, expect, it, vi } from "vitest";
import { PDFPage } from "pdf-lib";
import { gerarRncPDF } from "@/lib/rnc-pdf";
import { refFORM } from "@/lib/sgq-forms";

afterEach(() => vi.restoreAllMocks());

it.each(["INTERNA", "CLIENTE"])("mantém FORM 20 fora da faixa laranja e dos demais elementos em RNC %s", async (tipo) => {
  const textos = vi.spyOn(PDFPage.prototype, "drawText");
  const retangulos = vi.spyOn(PDFPage.prototype, "drawRectangle");
  const imagens = vi.spyOn(PDFPage.prototype, "drawImage");
  await gerarRncPDF({ numero: 1, ano: 2026, tipo, apontamentos: [{ procedente: true }, { procedente: false }] });
  const [, ref] = textos.mock.calls.find(([texto]) => texto === refFORM(20));
  const caixa = (o) => ({ x: o.x, y: o.y - o.size * 0.25, width: o.font.widthOfTextAtSize(refFORM(20), o.size), height: o.size * 1.25 });
  const r = caixa(ref);
  const sobrepoe = (b) => r.x < b.x + b.width && r.x + r.width > b.x && r.y < b.y + b.height && r.y + r.height > b.y;
  const faixa = retangulos.mock.calls.find(([o]) => o.height === 6)[0];
  expect(sobrepoe(faixa)).toBe(false);
  expect(r.y).toBeGreaterThan(faixa.y + faixa.height + 2);
  for (const [, o] of imagens.mock.calls) expect(sobrepoe(o)).toBe(false);
  for (const [o] of retangulos.mock.calls.filter(([o]) => o.height === 15)) expect(sobrepoe(o)).toBe(false);
});
