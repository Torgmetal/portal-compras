import { describe, it, expect } from "vitest";
import { itensDoPedido, totalDosItens, divergenciaProposta } from "@/lib/pedido-itens";

// ⚠⚠ Matheus (16/09/2026): "no Omie eu preciso que seja preenchido certo no pedido de compra o
// campo IPI do valor unitário, está entrando o preço unitário cheio com IPI sem entrar no campo de
// IPI". Os números destes testes são os do pedido 2077 (RM T118-006-R00, Pizzinatto) DEPOIS de ele
// corrigir à mão no Omie — foi quando o pedido finalmente bateu com o PDF do fornecedor.
//
// ⚠ Esta função decide dinheiro e não tinha teste nenhum até aqui.

const linha = (over = {}) => ({
  cotItem: { precoUnit: 40.68, qtdCotada: 66, ipiPct: 3.25, ...(over.cotItem || {}) },
  rmItem: { descricao: "RUFO GALVALUME 0.50mm", unidade: "MT", qtd: 66, peso: 0, ...(over.rmItem || {}) },
  codigoOmieItem: "022574",
});

describe("itensDoPedido — o IPI sai separado do preço", () => {
  it("o preço unitário é o LÍQUIDO que o fornecedor cotou", () => {
    const { itens } = itensDoPedido([linha()]);
    expect(itens[0].precoUnit).toBe(40.68);
  });

  it("o valor do IPI vem calculado à parte, em reais", () => {
    // 40,68 × 66 × 3,25% = 87,26 — o mesmo valor que o Omie mostra no item corrigido.
    expect(itensDoPedido([linha()]).itens[0].valorIpi).toBe(87.26);
  });

  it("⚠⚠ o TOTAL não muda: base + IPI é o que o preço cheio dava antes", () => {
    const { itens } = itensDoPedido([linha()]);
    const comoEraAntes = 40.68 * 1.0325 * 66;
    expect(itens[0].totalComImpostos).toBeCloseTo(comoEraAntes, 1);
    expect(itens[0].totalComImpostos).toBe(2772.14); // 2.684,88 + 87,26
  });

  it("a alíquota segue junto, para o Omie e para a conferência", () => {
    expect(itensDoPedido([linha()]).itens[0].ipiPct).toBe(3.25);
  });

  it("item sem IPI não ganha imposto nenhum", () => {
    const { itens } = itensDoPedido([linha({ cotItem: { precoUnit: 60.15, qtdCotada: 290.4, ipiPct: 0 } })]);
    expect(itens[0].valorIpi).toBe(0);
    expect(itens[0].totalComImpostos).toBeCloseTo(17467.56, 2);
  });

  it("⚠ IPI não informado (null) não vira imposto — mas também não inventa alíquota", () => {
    const { itens } = itensDoPedido([linha({ cotItem: { precoUnit: 10, qtdCotada: 2, ipiPct: null } })]);
    expect(itens[0].valorIpi).toBe(0);
    expect(itens[0].totalComImpostos).toBe(20);
  });
});

describe("itensDoPedido — a proposta inteira da Pizzinatto", () => {
  // As 11 linhas com IPI do pedido 2077, conferidas contra a tela do Omie depois da correção.
  const COM_IPI = [
    { precoUnit: 23.25, qtdCotada: 6, ipiPct: 3.25, esperado: 4.53 },
    { precoUnit: 40.68, qtdCotada: 66, ipiPct: 3.25, esperado: 87.26 },
    { precoUnit: 29.06, qtdCotada: 27, ipiPct: 3.25, esperado: 25.50 },
    { precoUnit: 64.63, qtdCotada: 15, ipiPct: 3.25, esperado: 31.51 },
    { precoUnit: 64.63, qtdCotada: 15, ipiPct: 3.25, esperado: 31.51 },
    { precoUnit: 45.62, qtdCotada: 0.7, ipiPct: 3.25, esperado: 1.04 },
    { precoUnit: 45.62, qtdCotada: 0.7, ipiPct: 3.25, esperado: 1.04 },
    { precoUnit: 26.62, qtdCotada: 1.2, ipiPct: 3.25, esperado: 1.04 },
    { precoUnit: 23.25, qtdCotada: 17.6, ipiPct: 3.25, esperado: 13.30 },
    { precoUnit: 29.06, qtdCotada: 4.4, ipiPct: 3.25, esperado: 4.16 },
    { precoUnit: 26.73, qtdCotada: 31.5, ipiPct: 3.25, esperado: 27.37 },
  ];

  it("cada linha bate com o IPI que o Omie calculou", () => {
    for (const c of COM_IPI) {
      const { itens } = itensDoPedido([linha({ cotItem: c })]);
      expect(itens[0].valorIpi).toBeCloseTo(c.esperado, 2);
    }
  });

  it("⚠ e a soma dos IPI fecha com o total do PDF do fornecedor (R$ 228,25)", () => {
    const { itens } = itensDoPedido(COM_IPI.map((c) => linha({ cotItem: c })));
    const soma = itens.reduce((s, i) => s + i.valorIpi, 0);
    // O PDF diz 228,25; o Omie calculou 228,26. A diferença é arredondamento por linha.
    expect(soma).toBeCloseTo(228.25, 1);
  });
});

describe("totalDosItens — uma conta só para as duas rotas de geração", () => {
  it("soma base + IPI de todos os itens", () => {
    const { itens } = itensDoPedido([
      linha(),
      linha({ cotItem: { precoUnit: 60.15, qtdCotada: 290.4, ipiPct: 0 } }),
    ]);
    expect(totalDosItens(itens)).toBe(20239.7); // 2.772,14 + 17.467,56
  });

  it("⚠⚠ o total NÃO pode ignorar o IPI — era o risco de mover o imposto para fora do preço", () => {
    const { itens } = itensDoPedido([linha()]);
    const somaIngenua = itens.reduce((s, i) => s + i.qtd * i.precoUnit, 0);
    expect(totalDosItens(itens)).toBeGreaterThan(somaIngenua);
    expect(totalDosItens(itens) - somaIngenua).toBeCloseTo(87.26, 2);
  });

  it("lista vazia soma zero", () => {
    expect(totalDosItens([])).toBe(0);
    expect(totalDosItens(null)).toBe(0);
  });
});

describe("itensDoPedido — a observação do item vai junto", () => {
  it("leva a observação que a engenharia escreveu", () => {
    const { itens } = itensDoPedido([linha({ rmItem: { observacao: "Máquina de Solda TIG Inversora" } })]);
    expect(itens[0].observacao).toBe("Máquina de Solda TIG Inversora");
  });

  it("⚠ observação em branco vira null, não string vazia — o Omie não precisa de campo vazio", () => {
    expect(itensDoPedido([linha({ rmItem: { observacao: "   " } })]).itens[0].observacao).toBe(null);
    expect(itensDoPedido([linha()]).itens[0].observacao).toBe(null);
  });
});

describe("o que já existia continua valendo", () => {
  it("quantidade sai como o fornecedor cotou, mesmo sendo lote mínimo", () => {
    const { itens } = itensDoPedido([linha({ cotItem: { precoUnit: 7.8, qtdCotada: 94, ipiPct: 0 }, rmItem: { peso: 76.95 } })]);
    expect(itens[0].qtd).toBe(94);
    expect(itens[0].precoUnit).toBe(7.8);
  });

  it("⚠ quantidade fora de ordem de grandeza continua AVISANDO, não corrigindo", () => {
    const { itens, alertas } = itensDoPedido([
      linha({ cotItem: { precoUnit: 7390, qtdCotada: 13.28, ipiPct: 0 }, rmItem: { peso: 13276 } }),
    ]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].motivo).toContain("confira se a quantidade");
    expect(itens[0].qtd).toBe(13.28); // avisou, não mexeu
  });

  it("sem quantidade cotada, cai no peso da RM", () => {
    const { itens } = itensDoPedido([linha({ cotItem: { precoUnit: 5, qtdCotada: 0, ipiPct: 0 }, rmItem: { peso: 120 } })]);
    expect(itens[0].qtd).toBe(120);
    expect(itens[0].unidade).toBe("KG");
  });

  it("divergenciaProposta continua avisando sem corrigir", () => {
    expect(divergenciaProposta(1000, 900, true).texto).toContain("difere da soma dos itens");
    expect(divergenciaProposta(1000, 900, false).texto).toBe(null);
  });
});
