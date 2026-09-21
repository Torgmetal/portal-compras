// As COLUNAS da planilha que o PCP recebe por e-mail — lidas de volta do arquivo gerado.
//
// ⚠⚠ ESTE CONTRATO É DE OUTRO SETOR. Matheus (17/09/2026): "precisa sair uma coluna somente com as
// marcas/tags, ou[tra] com descrição, quantidade, peso e observações de cada se tiver (…) ela vai
// usar essa relação para realizar Romaneios". O PCP COPIA a coluna A inteira; trocar a ordem das
// colunas aqui quebra o trabalho de alguém que não tem como saber que mudou.
//
// ⚠ Lê o XLSX de verdade em vez de checar o array que entrou: o que importa é o que abre no Excel.
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { montarRelatorio } from "@/lib/conferencia-relatorio";
import { gerarConferenciaExcel } from "@/lib/conferencia-peca-excel";

const REL = montarRelatorio({
  sessao: { id: "c1", status: "FINALIZADA", iniciadaEm: new Date("2026-09-17T10:00:00Z"),
            finalizadaEm: new Date("2026-09-17T15:00:00Z"), iniciadaPorNome: "Zé", finalizadaPorNome: "Zé" },
  op: { numero: 97, cliente: "MEGASTEAM", obra: "Galpão 3" },
  marcas: [
    { marca: "T97A140", descricao: "TRAVAMENTO", previsto: 2, conferido: 2, saldo: 0, pesoUnitKg: 12.5 },
    { marca: "T97A10", descricao: "CONTRAVENTAMENTO", previsto: 10, conferido: 4, saldo: 6, pesoUnitKg: 3.2 },
  ],
  lancamentos: [{ id: "l1", marca: "T97A10", qte: 4, observacao: "faltou pintura", criadoEm: new Date(), criadoPorNome: "Zé" }],
});

async function planilha() {
  const buf = await gerarConferenciaExcel(REL);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buf));
  return wb.worksheets[0];
}

const valores = (row) => row.values.slice(1).map((v) => (v && v.formula ? `=${v.formula}` : v));

describe("planilha da conferência", () => {
  it("o cabeçalho da tabela é o que o PCP espera, nesta ordem", async () => {
    const ws = await planilha();
    let cabecalho = null;
    ws.eachRow((row) => { if (!cabecalho && valores(row)[0] === "Marca") cabecalho = valores(row); });
    expect(cabecalho).toEqual([
      "Marca", "Descrição", "Previsto", "Conferido", "Saldo",
      "Situação", "Peso unit. (kg)", "Peso conferido (kg)", "Observações",
    ]);
  });

  it("⚠⚠ a coluna A traz a MARCA sozinha — é a coluna que o PCP copia para o romaneio", async () => {
    const ws = await planilha();
    const marcas = [];
    let achouCabecalho = false;
    ws.eachRow((row) => {
      const v = valores(row);
      if (v[0] === "Marca") { achouCabecalho = true; return; }
      if (achouCabecalho && v[0] && v[0] !== "TOTAL") marcas.push(v[0]);
    });
    expect(marcas).toEqual(["T97A10", "T97A140"]); // pendente primeiro, como no resto do documento
  });

  it("peso e observação saem na linha da marca", async () => {
    const ws = await planilha();
    let linha = null;
    ws.eachRow((row) => { if (valores(row)[0] === "T97A10") linha = valores(row); });
    expect(linha[6]).toBe(3.2);        // peso unitário
    expect(linha[7]).toBe(12.8);       // 4 conferidas × 3,2
    expect(linha[8]).toBe("faltou pintura");
  });

  it("a marca sem observação não inventa texto", async () => {
    const ws = await planilha();
    let linha = null;
    ws.eachRow((row) => { if (valores(row)[0] === "T97A140") linha = valores(row); });
    expect(linha[8] == null || linha[8] === "").toBe(true);
  });
});
