import { describe, it, expect } from "vitest";
import {
  unidadeCanonica, fatorFixo, converterParaRM, paraODocumento, totalBate, conversaoDoItem,
} from "@/lib/unidades";

// ─── A UNIDADE DO DOCUMENTO E A DA RM ────────────────────────────────────────
//
// Matheus (22/09/2026): "orçamos em unidades, tipo 2500 parafusos, e os fornecedores mandam a
// cotação em CT — nesse caso seriam 25 CT".

describe("unidadeCanonica — 63 grafias, 12 unidades", () => {
  // ⚠⚠ MEDIDO NA BASE: "PEÇA" aparece em 7 grafias na RMItem, "barra" em 4. Tabela de conversão
  // indexada pelo texto cru erra antes de começar.
  it.each(["Peça", "Pç(s)", "PÇ", "PEÇA", "Peças", "Pç", "peça(s)", "PEÇAS", "PC"])(
    "%s é PC", (t) => expect(unidadeCanonica(t)).toBe("PC"));

  it.each(["barra(s)", "Barra", "BR", "BARRA(S)", "BARRAS"])(
    "%s é BR", (t) => expect(unidadeCanonica(t)).toBe("BR"));

  it.each([["UN", "UN"], ["UNID", "UN"], ["CENTO", "CT"], ["ct", "CT"], ["MILHEIRO", "MI"],
           ["DUZIA", "DZ"], ["m²", "M2"], ["M2", "M2"], ["METRO", "M"], ["ML", "M"], ["KG", "KG"]])(
    "%s é %s", (t, esperado) => expect(unidadeCanonica(t)).toBe(esperado));

  // ⚠⚠ DESCONHECIDO É `null`, NÃO UM CHUTE. O `normalizeUnidade` do pedido faz substring(0,6) no
  // que não reconhece — foi assim que "LATA 2,80L" virou "LATA280" no Omie.
  it.each(["LATA 2,80L", "BALDE 18L", "VB", "DOBRA", "", null])(
    "%s não é unidade de conversão", (t) => expect(unidadeCanonica(t)).toBeNull());
});

describe("fatorFixo — o que cabe em tabela", () => {
  it("1 CT são 100 UN", () => expect(fatorFixo("CT", "UN")).toBe(100));
  it("1 MI são 1000 UN", () => expect(fatorFixo("MILHEIRO", "UN")).toBe(1000));
  it("1 DZ são 12 UN", () => expect(fatorFixo("DZ", "UN")).toBe(12));
  it("a mesma unidade é 1", () => expect(fatorFixo("UN", "UNIDADE")).toBe(1));

  // ⚠ O sentido do fator é UM só: quantas unidades da RM cabem em 1 unidade cotada.
  it("o caminho inverso é o recíproco", () => expect(fatorFixo("UN", "CT")).toBe(0.01));
  it("peça e unidade são intercambiáveis", () => expect(fatorFixo("PC", "UN")).toBe(1));

  // ⚠⚠ METADE DAS CONVERSÕES NÃO CABE EM TABELA: a telha em metro linear depende do COMPRIMENTO
  // daquela telha, e o quilo depende do peso da peça. Devolver 1 seria inventar equivalência.
  it.each([["M", "UN"], ["KG", "UN"], ["M2", "UN"], ["BR", "KG"]])(
    "%s → %s depende do item, e devolve null", (de, para) => expect(fatorFixo(de, para)).toBeNull());

  it("unidade desconhecida não gera fator", () => expect(fatorFixo("LATA 18L", "UN")).toBeNull());
});

describe("converterParaRM — a quantidade multiplica, o preço divide", () => {
  // ⚠⚠ O EXEMPLO DO MATHEUS, DE PONTA A PONTA.
  it("25 CT a R$ 50,00 viram 2500 UN a R$ 0,50 — e o total não muda", () => {
    const r = converterParaRM({ qtd: 25, preco: 50, fator: 100 });
    expect(r).toMatchObject({ qtd: 2500, preco: 0.5, total: 1250 });
  });

  // ⚠ A telha: 1 UN de 5,20 m cotada por metro.
  it("telha de 5,20 m: 130 ML a R$ 10,00 viram 25 UN a R$ 52,00", () => {
    const r = converterParaRM({ qtd: 130, preco: 10, fator: 25 / 130 });
    expect(r.qtd).toBe(25);
    expect(r.preco).toBeCloseTo(52, 6);
    expect(r.total).toBe(1300);
  });

  it("a volta devolve o documento", () => {
    expect(paraODocumento({ qtd: 2500, preco: 0.5, fator: 100 })).toMatchObject({ qtd: 25, preco: 50 });
  });

  it("sem fator, nada muda", () => {
    expect(converterParaRM({ qtd: 10, preco: 3, fator: null })).toMatchObject({ qtd: 10, preco: 3, total: 30 });
  });
});

describe("a trava: o total não pode mudar", () => {
  it("bate ao centavo", () => expect(totalBate(1250, 1250.004)).toBe(true));
  it("um centavo de diferença NÃO passa", () => expect(totalBate(1250, 1250.01)).toBe(false));

  // ⚠ Fator que não divide redondo deixa dízima no unitário — o que não pode é o TOTAL mudar.
  it("R$ 49,99 o cento: o unitário vira dízima e o total fecha", () => {
    const r = conversaoDoItem({ qtdDoc: 25, precoDoc: 49.99, fator: 100, unidadeCotada: "CT", unidadeRM: "UN" });
    expect(r.ok).toBe(true);
    expect(r.qtd).toBe(2500);
    expect(r.total).toBe(1249.75);
  });

  it("sem fator, a conversão é recusada — não chutada", () => {
    const r = conversaoDoItem({ qtdDoc: 130, precoDoc: 10, fator: null, unidadeCotada: "M", unidadeRM: "UN" });
    expect(r.erro).toMatch(/quantas unidades/i);
    expect(r.ok).toBeUndefined();
  });

  it("fator zero ou negativo não passa", () => {
    expect(conversaoDoItem({ qtdDoc: 1, precoDoc: 1, fator: 0, unidadeCotada: "CT", unidadeRM: "UN" }).erro).toBeTruthy();
    expect(conversaoDoItem({ qtdDoc: 1, precoDoc: 1, fator: -5, unidadeCotada: "CT", unidadeRM: "UN" }).erro).toBeTruthy();
  });

  // ⚠⚠ ESTE É O DEFEITO QUE A LIB EXISTE PARA IMPEDIR: converter a quantidade sem o preço. É o que
  // `lib/pedido-itens.js` documenta ter custado 136 de 578 itens vencedores divergentes.
  it("a conversão preserva o total em qualquer fator", () => {
    for (const fator of [100, 1000, 12, 2, 0.01, 5.2, 1 / 3]) {
      const r = converterParaRM({ qtd: 37, preco: 8.4, fator });
      expect(totalBate(r.total, 37 * 8.4)).toBe(true);
    }
  });
});
