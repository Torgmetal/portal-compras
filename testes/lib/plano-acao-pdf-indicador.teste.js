import { afterEach, expect, it, vi } from "vitest";
import { PDFPage, rgb } from "pdf-lib";
import { gerarPlanoAcaoPDF } from "@/lib/plano-acao-pdf";
afterEach(() => vi.restoreAllMocks());
it.each([[7, "08/2026"], [0, "01/2026"]])("imprime mês %s na convenção da tela", async (mes, esperado) => {
  const texto = vi.spyOn(PDFPage.prototype, "drawText");
  await gerarPlanoAcaoPDF({ numero: 21, indicador: "absenteismo", processo: "RH", ano: 2026, mes, valor: 16.5, metaValor: 2, status: "CONCLUIDO", itens: [] });
  expect(texto.mock.calls.map(([valor]) => valor)).toContain(`RH · ${esperado}`);
  expect(texto.mock.calls.find(([valor]) => valor === "Resultado 16,5  ·  Meta 2")[1].color).toEqual(rgb(0.72, 0.22, 0.22));
});
