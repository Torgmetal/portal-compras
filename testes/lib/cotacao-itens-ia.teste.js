import { describe, expect, it } from "vitest";
import { sanitizeItens } from "@/lib/cotacao-itens-ia";
import { BASE_TOTAL } from "@/lib/cotacao-total-pdf";

const um = (extra) => sanitizeItens([{ descricao: "CHAPA", qtd: 227, precoUnit: 6.74, ...extra }], 3)[0];

describe("o preço que a IA leu", () => {
  // ⚠⚠ O RISCO MAIS CARO DOS DOIS (achado do Codex, 21/09/2026). Antes desta guarda, o total com
  // IPI fazia a rotina "corrigir" 6,74 para 6,96 — o portal subindo a proposta do fornecedor em
  // 3,25% sem ninguém pedir, num documento de outra empresa.
  it("NÃO é reescrito quando o total declarado é o total com IPI", () => {
    const r = um({ totalBruto: 1579.70, ipiPct: 3.25 });
    expect(r.precoUnit).toBe(6.74);
    expect(r._warning).toMatch(/incluir o IPI/i);
    // ⚠ e a base acompanha o total, senão o alarme falso voltava pela tela
    expect(r.baseTotal).toBe(BASE_TOTAL.COM_IPI);
  });

  // ⚠ O comportamento de HOJE continua de pé fora da janela da guarda: sem IPI que explique a
  // diferença, um "preço" que é o total da linha segue sendo corrigido.
  it("É reescrito quando o preço lido era mesmo o total da linha", () => {
    const r = um({ precoUnit: 1529.98, totalBruto: 1529.98, ipiPct: 0 });
    expect(r.precoUnit).toBe(6.74);
    expect(r._warning).toMatch(/Preco corrigido/i);
    expect(r.baseTotal).toBe(BASE_TOTAL.LIQUIDO);
  });

  it("bateu com o total: nada a avisar, base líquida", () => {
    const r = um({ totalBruto: 1529.98, ipiPct: 3.25 });
    expect(r.precoUnit).toBe(6.74);
    expect(r._warning).toBe(null);
    expect(r.baseTotal).toBe(BASE_TOTAL.LIQUIDO);
  });

  it("preço absurdo (>10k/un) é zerado com aviso", () => {
    const r = um({ precoUnit: 72163200, totalBruto: 1529.98 });
    expect(r.precoUnit).toBe(0);
    expect(r._warning).toMatch(/suspeito/i);
  });

  // ⚠⚠ CARACTERIZAÇÃO, NÃO APROVAÇÃO. Fora da janela da guarda, uma divergência de 20% ainda
  // reescreve o preço para `total ÷ qtd` — comportamento de HOJE, mantido de propósito ("só não
  // quebre ou piore o jeito que é feito hoje"). Fica congelado aqui para a próxima mudança ser
  // deliberada: a rigor, 20% não prova que o preço estava errado, só que algo não fecha.
  it("divergência que não é imposto ainda reescreve o preço — e avisa", () => {
    const r = um({ totalBruto: 1835.98, ipiPct: 3.25 });
    expect(r.precoUnit).toBe(8.09); // 1835,98 ÷ 227
    expect(r._warning).toMatch(/Preco corrigido/i);
  });
});

describe("o rmIndex que a IA devolveu", () => {
  it("fora da RM vira null, em vez de apontar para uma linha que não existe", () => {
    expect(um({ rmIndex: 9 }).rmIndex).toBe(null);
    expect(um({ rmIndex: -1 }).rmIndex).toBe(null);
    expect(um({ rmIndex: "1" }).rmIndex).toBe(null);
  });
  it("dentro da RM passa", () => {
    expect(um({ rmIndex: 2 }).rmIndex).toBe(2);
    expect(um({ rmIndex: null }).rmIndex).toBe(null);
  });
});
