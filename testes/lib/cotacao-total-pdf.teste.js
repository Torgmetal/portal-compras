import { describe, expect, it } from "vitest";
import { BASE_TOTAL, divergeDoPdf, ehTotalComImposto, toleranciaDe } from "@/lib/cotacao-total-pdf";

// ⚠⚠ OS NÚMEROS DAQUI SÃO MEDIDOS, NÃO INVENTADOS. Vêm do PDF real da SOUFER da RM T122-002
// (21/09/2026), lido pelo parser na tela: qtd 227, preço 6,74, IPI 3,25%, total impresso 1.579,70
// — e 227 × 6,74 = 1.529,98, que é exatamente 3,25% abaixo. As 8 linhas daquele documento e as 9
// da T122-001 (IPI zero) fecham com erro de 0,000%.
const SOUFER_COM_IPI = { pdfTotal: 1579.70, precoUnit: 6.74, qtd: 227, ipiPct: 3.25 };
const SOUFER_SEM_IPI = { pdfTotal: 15877.35, precoUnit: 6.19, qtd: 2565, ipiPct: 0 };

describe("o aviso vermelho da linha (divergeDoPdf)", () => {
  // ⚠⚠ É O DEFEITO QUE ESTE MÓDULO EXISTE PARA MATAR. Sem a base declarada, esta linha CERTA
  // acendia vermelho — e com ela as outras 6 da mesma proposta.
  it("total com IPI, base declarada: NÃO diverge", () => {
    expect(divergeDoPdf({ ...SOUFER_COM_IPI, baseTotal: BASE_TOTAL.COM_IPI })).toBe(false);
  });

  it("o mesmo total sem a base declarada também não acende — na dúvida, aceita as duas leituras", () => {
    expect(divergeDoPdf({ ...SOUFER_COM_IPI, baseTotal: null })).toBe(false);
  });

  // ⚠ Este é o caso em que a base declarada PEGA o que a dúvida deixaria passar.
  it("base LÍQUIDO declarada: um total com IPI embutido acende", () => {
    expect(divergeDoPdf({ ...SOUFER_COM_IPI, baseTotal: BASE_TOTAL.LIQUIDO })).toBe(true);
  });

  it("IPI zero cai na regra de sempre, nas três bases", () => {
    for (const base of [BASE_TOTAL.LIQUIDO, BASE_TOTAL.COM_IPI, null]) {
      expect(divergeDoPdf({ ...SOUFER_SEM_IPI, baseTotal: base }), String(base)).toBe(false);
    }
  });

  // ⚠⚠ A CHECAGEM NÃO PODE TER SIDO AFROUXADA. É para isto que ela existe: o "preço unitário" lido
  // era o total da linha. Erra por ordens de grandeza, e acende em qualquer base.
  it("preço lido como total continua acendendo em qualquer base", () => {
    const errado = { pdfTotal: 1579.70, precoUnit: 1579.70, qtd: 227, ipiPct: 3.25 };
    for (const base of [BASE_TOTAL.LIQUIDO, BASE_TOTAL.COM_IPI, null]) {
      expect(divergeDoPdf({ ...errado, baseTotal: base }), String(base)).toBe(true);
    }
  });

  // ⚠ O ponto cego é do tamanho exato do IPI, e só existe quando a base é desconhecida.
  it("erro de vírgula (10×) acende mesmo sem base declarada", () => {
    expect(divergeDoPdf({ pdfTotal: 15797.0, precoUnit: 6.74, qtd: 227, ipiPct: 3.25, baseTotal: null })).toBe(true);
  });

  it("sem um dos lados não afirma nada — 'não sei' nunca vira 'está errado'", () => {
    expect(divergeDoPdf({ pdfTotal: 0, precoUnit: 6.74, qtd: 227, ipiPct: 0 })).toBe(false);
    expect(divergeDoPdf({ pdfTotal: 100, precoUnit: 0, qtd: 227, ipiPct: 0 })).toBe(false);
    expect(divergeDoPdf({ pdfTotal: 100, precoUnit: 6.74, qtd: 0, ipiPct: 0 })).toBe(false);
  });

  it("a tolerância continua 1% com piso de 50 centavos", () => {
    expect(toleranciaDe(10000)).toBe(100);
    expect(toleranciaDe(10)).toBe(0.5);
  });
});

describe("a guarda que impede o portal de reescrever o preço (ehTotalComImposto)", () => {
  it("reconhece o total com IPI da SOUFER", () => {
    expect(ehTotalComImposto({
      totalDeclarado: 1579.70, precoUnit: 6.74, qtd: 227, ipiPct: 3.25,
    })).toBe(true);
  });

  // ⚠⚠ A JANELA É ESTREITA DE PROPÓSITO. Sem IPI declarado não há o que explicar a diferença, e
  // a correção de preço (que é o comportamento de hoje) tem de continuar valendo.
  it("sem IPI declarado, não reconhece — e o preço mal lido segue sendo corrigido", () => {
    expect(ehTotalComImposto({
      totalDeclarado: 1579.70, precoUnit: 1579.70, qtd: 227, ipiPct: 0,
    })).toBe(false);
  });

  it("não reconhece quando o total já bate com o líquido (nada a explicar)", () => {
    expect(ehTotalComImposto({
      totalDeclarado: 1529.98, precoUnit: 6.74, qtd: 227, ipiPct: 3.25,
    })).toBe(false);
  });

  it("não reconhece quando a diferença não é o IPI", () => {
    // 20% de diferença com IPI de 3,25% declarado: a conta não fecha em imposto nenhum
    expect(ehTotalComImposto({
      totalDeclarado: 1835.98, precoUnit: 6.74, qtd: 227, ipiPct: 3.25,
    })).toBe(false);
  });
});
