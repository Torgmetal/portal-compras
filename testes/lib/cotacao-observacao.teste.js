// ⚠⚠ `Cotacao.observacao` guarda TRÊS coisas num campo só ("Prazo de entrega: X | Pagamento: Y |
// <texto do fornecedor>"), porque é assim que a rota de submissão grava. A tela de compras não
// mostrava nada disso — 447 cotações no banco têm este campo preenchido (16/09/2026).
import { describe, it, expect } from "vitest";
import { parseObservacaoCotacao, temObservacaoDoFornecedor } from "@/lib/cotacao-observacao";

describe("parseObservacaoCotacao", () => {
  it("separa as três partes que a rota juntou", () => {
    expect(parseObservacaoCotacao("Prazo de entrega: 7 dias | Pagamento: 30/45 dd | sem frete incluso"))
      .toEqual({ prazoEntrega: "7 dias", condicaoPagamento: "30/45 dd", observacao: "sem frete incluso" });
  });

  // Caso real do banco: só prazo e pagamento, sem texto livre.
  it("sem texto do fornecedor, a observação fica vazia", () => {
    expect(parseObservacaoCotacao("Prazo de entrega: 10 | Pagamento: 28/42/56 DDL"))
      .toEqual({ prazoEntrega: "10", condicaoPagamento: "28/42/56 DDL", observacao: "" });
  });

  it("texto solto, sem os rótulos, é observação inteira", () => {
    expect(parseObservacaoCotacao("SEM DISPONIBILIDADE").observacao).toBe("SEM DISPONIBILIDADE");
  });

  // ⚠ O fornecedor pode usar o próprio separador no texto dele; juntar de volta devolve o texto
  // inteiro, e não só o primeiro pedaço.
  it("o separador dentro do texto do fornecedor não corta a frase", () => {
    expect(parseObservacaoCotacao("Prazo de entrega: 5 | entrega parcial | resto em 20 dias").observacao)
      .toBe("entrega parcial | resto em 20 dias");
  });

  it("vazio, nulo e espaços não viram texto", () => {
    for (const v of [null, undefined, "", "   ", " | | "]) {
      expect(parseObservacaoCotacao(v)).toEqual({ prazoEntrega: "", condicaoPagamento: "", observacao: "" });
    }
  });

  it("lançada manualmente entra como observação — é o que o comprador digitou", () => {
    expect(parseObservacaoCotacao("Prazo de entrega: 10 dias | Pagamento: 28/42/56 | Lançada manualmente por Vitor Costa").observacao)
      .toBe("Lançada manualmente por Vitor Costa");
  });
});

describe("temObservacaoDoFornecedor", () => {
  it("acha o texto na cotação ou em qualquer item", () => {
    expect(temObservacaoDoFornecedor({ observacao: "Prazo de entrega: 5", itens: [] })).toBe(false);
    expect(temObservacaoDoFornecedor({ observacao: "Prazo de entrega: 5 | sem estoque", itens: [] })).toBe(true);
    expect(temObservacaoDoFornecedor({ observacao: null, itens: [{ observacao: "CORTE 8 DIAS UTEIS" }] })).toBe(true);
    expect(temObservacaoDoFornecedor({ observacao: null, itens: [{ observacao: "  " }] })).toBe(false);
  });

  it("não quebra sem cotação", () => {
    expect(temObservacaoDoFornecedor(null)).toBe(false);
    expect(temObservacaoDoFornecedor({})).toBe(false);
  });
});

// ⚠⚠ Matheus (16/09/2026): "quando o fornecedor preenche forma de pagamento devia aparecer também
// na tela pra gente avaliar igual o prazo de entrega". A condição existia no banco em 435 das 672
// cotações e o único lugar que a mostrava era o EXCEL do mapa comparativo. Estes testes travam de
// ONDE a tela lê — são duas fontes, e ler a errada faz sumir justamente a cotação lançada à mão.
describe("condicaoPagamentoDe", () => {
  it("prefere o campo próprio", async () => {
    const { condicaoPagamentoDe } = await import("@/lib/cotacao-observacao");
    expect(condicaoPagamentoDe({ prazoPagamento: "30/60/90", observacao: "Pagamento: à vista" })).toBe("30/60/90");
  });

  it("⚠ cai na observação quando o campo próprio está vazio — formato antigo", async () => {
    const { condicaoPagamentoDe } = await import("@/lib/cotacao-observacao");
    expect(condicaoPagamentoDe({ prazoPagamento: null, observacao: "Prazo de entrega: 7 dias | Pagamento: 28 DDL" })).toBe("28 DDL");
    expect(condicaoPagamentoDe({ prazoPagamento: "   ", observacao: "Pagamento: à vista" })).toBe("à vista");
  });

  it("sem nenhuma das duas, devolve vazio — a tela não escreve 'Pagamento:' pelado", async () => {
    const { condicaoPagamentoDe } = await import("@/lib/cotacao-observacao");
    expect(condicaoPagamentoDe({ prazoPagamento: null, observacao: "SEM DISPONIBILIDADE" })).toBe("");
    expect(condicaoPagamentoDe({})).toBe("");
    expect(condicaoPagamentoDe(null)).toBe("");
  });
});
