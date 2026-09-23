import { it, expect, vi, afterEach } from "vitest";
import { PDFPage } from "pdf-lib";
import { extractText } from "unpdf";
import { gerarDimensionalPDF } from "@/lib/relatorio-dimensional-pdf";

// O DIMENSIONAL (e a pré-montagem, que sai dele) — dois achados da varredura de 23/09/2026:
//  · a hora da assinatura era formatada sem fuso: na Vercel (UTC) as 07:23 de Brasília saíam 10:23,
//    e quem assinasse depois das 21h ganhava a data do dia seguinte;
//  · o RPM-103-002 foi APROVADO, assinado por todos e entrou no data book com a caixa RESULTADO
//    vazia — o resultado estava em `resultadoInspecao` e o PDF só lia `resultados.resultado`.

afterEach(() => { vi.restoreAllMocks(); process.env.TZ = TZ_ORIGINAL; });
const TZ_ORIGINAL = process.env.TZ;

const gerar = (relExtra = {}, assinaturas = []) => gerarDimensionalPDF({
  rel: {
    tipo: "PRE_MONTAGEM", codigo: "RPM-999-001", opNumero: "999", inspetor: "Geraldo Tank", marcas: ["C1"], desenhos: [], resultados: {},
    linhas: [{ marca: "C1", descricao: "Cota A", letra: "A", projetoMm: 100, encontradoMm: 100, tolerancia: "± 2" }],
    ...relExtra,
  },
  assinaturas, fotos: [],
});

it("a hora da assinatura sai no horário de Brasília mesmo com o servidor em UTC", async () => {
  process.env.TZ = "UTC";
  // 10:23 UTC = 07:23 em Brasília
  const pdf = await gerar({}, [{ nome: "Geraldo Tank", setor: "Torg Metal", email: "q@t.com", assinadoEm: new Date("2026-09-17T10:23:00Z"), ip: "1.1.1.1", imagemUrl: null }]);
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  expect(text).toContain("17/09/2026 07:23");
  expect(text).not.toContain("10:23");
});

it("relatório aprovado marca APROVADO no RESULTADO, mesmo sem o campo do formulário preenchido", async () => {
  const cheios = [];
  const orig = PDFPage.prototype.drawRectangle;
  vi.spyOn(PDFPage.prototype, "drawRectangle").mockImplementation(function (o) {
    if (o?.width === 7 && o?.height === 7 && o?.color) cheios.push(o);
    return orig.call(this, o);
  });
  await gerar({ resultadoInspecao: "APROVADO" });
  // uma caixa marcada: a do RESULTADO. As três de cima (dimensional/alinhamento/acabamento) não —
  // ninguém registrou essas verificações, e o documento não as inventa.
  expect(cheios).toHaveLength(1);
});

it("sem resultado nenhum, nenhuma caixa é marcada", async () => {
  const cheios = [];
  const orig = PDFPage.prototype.drawRectangle;
  vi.spyOn(PDFPage.prototype, "drawRectangle").mockImplementation(function (o) {
    if (o?.width === 7 && o?.height === 7 && o?.color) cheios.push(o);
    return orig.call(this, o);
  });
  await gerar({ resultadoInspecao: null });
  expect(cheios).toHaveLength(0);
});
