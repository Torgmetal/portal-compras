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
it('pagina textos longos sem cortá-los, em paisagem e com cabeçalho repetido', async () => {
  const texto = vi.spyOn(PDFPage.prototype, 'drawText');
  const { bytes } = await gerarPlanoAcaoPDF({numero:1,titulo:'Plano de teste',status:'EM_ANDAMENTO',itens:[{oque:'Ação extensa',como:'Executar e acompanhar o procedimento completo. '.repeat(180)+'FIM-DO-COMO',quanto:'Sem custo',acompanhamento:'Acompanhamento detalhado. '.repeat(180)+'FIM-DO-ACOMPANHAMENTO'}]});
  const { PDFDocument } = await import('pdf-lib'); const doc=await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBeGreaterThan(1);
  expect(doc.getPages().every(p=>p.getWidth()>p.getHeight())).toBe(true);
  const chamadas=texto.mock.calls;
  expect(chamadas.some(([v])=>v.includes('FIM-DO-COMO'))).toBe(true);
  expect(chamadas.some(([v])=>v.includes('FIM-DO-ACOMPANHAMENTO'))).toBe(true);
  expect(chamadas.filter(([v])=>v==='O QUÊ').length).toBeGreaterThan(1);
  expect(chamadas.every(([,o])=>o.y>=20 && o.y<596)).toBe(true);
});
