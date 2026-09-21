import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, bufferWorkbookTorg } from "@/lib/excel-relatorio";

// Vitor (21/09/2026), sobre as planilhas do adiamento da OP-122: "essas planilhas com esses painéis
// congelados não estão legais, fica difícil de visualizar". O acabamento comum congelava o painel na
// linha do cabeçalho de TODA folha com uma tabela só — inclusive numa folha-relatório em que a tabela
// começa na linha 17: num notebook sobram 8 linhas rolando. Congelar serve para tabela de dados com o
// cabeçalho perto do topo; abaixo disso, atrapalha.

async function folha(linhasAntes, opts = {}) {
  const { workbook, sheet, linhaInicio } = await criarRelatorioTorg({ titulo: "Relatório de teste", totalColunas: 3, nomePlanilha: "Teste" });
  sheet.columns = [{ width: 30 }, { width: 14 }, { width: 14 }];
  const cab = linhaInicio + linhasAntes;
  adicionarHeaderTabela(sheet, cab, ["A", "B", "C"]);
  adicionarLinhaTabela(sheet, cab + 1, [1, 2, 3]);
  if (opts.semCongelar) sheet._torgSemCongelar = true;
  const copia = new ExcelJS.Workbook(); await copia.xlsx.load(await bufferWorkbookTorg(workbook));
  return { cab, views: copia.worksheets[0].views };
}

describe("painel congelado no acabamento comum", () => {
  it("cabeçalho perto do topo: congela na linha dele (tabela de dados)", async () => {
    const { cab, views } = await folha(0);
    expect(views[0]).toMatchObject({ state: "frozen", ySplit: cab });
  });
  it("cabeçalho longe do topo (folha-relatório): NÃO congela", async () => {
    const { views } = await folha(10);
    expect(views[0].state).not.toBe("frozen");
    expect(views[0].showGridLines).toBe(false);
  });
  it("a folha pode pedir para não congelar, mesmo com o cabeçalho no topo", async () => {
    const { views } = await folha(0, { semCongelar: true });
    expect(views[0].state).not.toBe("frozen");
  });
});
