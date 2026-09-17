// A receita do aditivo digitada à mão: peso, unitário e descrição (Vitor, 17/09/2026) — e a
// precedência que a rota usa (digitado > planilha do estudo > valor único).
import { describe, expect, it } from "vitest";
import { totalDaLinha, totalDasLinhas, linhasParaEnvio, linhaReceitaVazia, receitasDoAditivo, linhasDaPlanilha, unidadeInfo } from "@/lib/receita-aditivo";

describe("receita do aditivo — digitada à mão", () => {
  it("peso × unitário, com vírgula e ponto de milhar do jeito que se digita", () => {
    const l = linhaReceitaVazia({ descricao: "Passarela TC 8011", quantidade: "12.000", valorUnitario: "27,62" });
    expect(totalDaLinha(l)).toBe(331440);
    expect(linhasParaEnvio([l])).toEqual([{ categoria: "FABRICACAO", descricao: "Passarela TC 8011", tipoPreco: "POR_UNIDADE", unidade: "kg", quantidade: 12000, valorUnitario: 27.62, valor: 331440 }]);
  });

  it("valor fechado ignora quantidade e unitário", () => {
    const l = linhaReceitaVazia({ descricao: "Montagem", categoria: "MONTAGEM", unidade: "vb", valor: "15.000,50", quantidade: "3", valorUnitario: "9" });
    expect(totalDaLinha(l)).toBe(15000.5);
    expect(linhasParaEnvio([l])[0]).toMatchObject({ categoria: "MONTAGEM", tipoPreco: "VALOR", unidade: null, quantidade: null, valorUnitario: null, valor: 15000.5 });
  });

  it("linha em branco (sem descrição ou sem total) não vai para a rota — e não é erro", () => {
    expect(linhasParaEnvio([linhaReceitaVazia(), linhaReceitaVazia({ descricao: "só descrição" }), linhaReceitaVazia({ quantidade: "10", valorUnitario: "2" })])).toEqual([]);
    expect(totalDasLinhas([linhaReceitaVazia({ descricao: "a", quantidade: "1,5", valorUnitario: "10" }), linhaReceitaVazia({ descricao: "b", unidade: "vb", valor: "0,05" })])).toBe(15.05);
  });

  it("unidade fora da lista (veio da planilha) é aceita como está", () => {
    expect(unidadeInfo("t")).toMatchObject({ codigo: "t", quantidade: "Quantidade (t)" });
    expect(unidadeInfo("kg").quantidade).toBe("Peso (kg)");
  });
});

describe("receitasDoAditivo — o que a rota grava", () => {
  const digitada = { categoria: "FABRICACAO", descricao: "Passarela", tipoPreco: "POR_UNIDADE", unidade: "kg", quantidade: 12000, valorUnitario: 27.62, valor: 331440 };
  const estudo = { comercial: [{ item: 1, descricao: "Estrutura metálica", quantidade: 1000, unidade: "KG", unitario: 30, valor: 30000 }] };

  it("linhas digitadas vencem a planilha e o valor único; o valor do aditivo é a soma", () => {
    const r = receitasDoAditivo({ receitas: [digitada], estudoDados: estudo, valor: null, numero: 2 });
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ descricao: "Passarela", tipoPreco: "POR_UNIDADE", unidade: "kg", quantidade: 12000, valorUnitario: 27.62, valor: 331440, observacao: "aditivo 2" });
    expect(r.valor).toBe(331440);
  });

  it("sem linha digitada, a planilha do estudo manda", () => {
    const r = receitasDoAditivo({ receitas: [], estudoDados: estudo, numero: 3 });
    expect(r.linhas[0]).toMatchObject({ descricao: "Estrutura metálica", tipoPreco: "POR_UNIDADE", unidade: "kg", valor: 30000 });
    expect(r.linhas[0].observacao).toMatch(/aditivo 3$/);
    expect(r.valor).toBe(30000);
  });

  it("sem linha e sem planilha, o valor vira UMA linha com o pedido do cliente", () => {
    const r = receitasDoAditivo({ receitas: [], valor: 5000, descricao: "Montagem extra", numero: 1, pedidoTexto: "OC 232301-1" });
    expect(r.linhas).toEqual([{ categoria: "MONTAGEM", descricao: "Aditivo 1 — OC 232301-1", tipoPreco: "VALOR", unidade: null, quantidade: null, valorUnitario: null, valor: 5000, observacao: "aditivo 1" }]);
    expect(r.valor).toBe(5000);
  });

  it("nada informado: sem receita e sem valor", () => {
    expect(receitasDoAditivo({ numero: 1 })).toEqual({ linhas: [], valor: null });
  });

  it("valor explícito manda no valor do aditivo, sem mexer nas linhas", () => {
    expect(receitasDoAditivo({ receitas: [digitada], valor: 300000, numero: 2 }).valor).toBe(300000);
  });

  it("da planilha para o editor: unidade e valores prontos para digitar", () => {
    expect(linhasDaPlanilha(estudo)[0]).toMatchObject({ descricao: "Estrutura metálica", unidade: "kg", quantidade: 1000, valorUnitario: 30, valor: 30000 });
  });
});
