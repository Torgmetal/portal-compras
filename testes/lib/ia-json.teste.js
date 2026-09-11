import { describe, it, expect } from "vitest";
import { extrairJson, recuperarJsonTruncado, motivoDaFalhaIA } from "@/lib/ia-json";

// ⚠⚠ O CASO QUE ORIGINOU ESTE ARQUIVO. Matheus (11/09/2026): "deu erro para importar um PDF grande
// para a IA preencher a cotação — Falha ao processar: IA devolveu resposta não-JSON. Provável ruído
// na extração". A resposta não tinha ruído: tinha sido CORTADA no meio, porque a proposta grande
// gera mais itens do que cabe no teto de saída. Estes testes congelam as duas coisas que faltavam:
// reconhecer o corte, e não jogar fora o que já tinha sido lido.

const item = (i) =>
  `{"rmIndex":${i},"descricao":"CHAPA GROSSA ASTM A36 ${i},50 X 1500 X 3000","qtd":${1000 + i},` +
  `"unidade":"KG","precoUnit":7.${i},"icmsPct":18,"ipiPct":0,"totalBruto":${(1000 + i) * 7},` +
  `"prazoEntrega":"15 dias","observacao":null}`;

const completo = (n) =>
  `<json>\n{"fornecedor":"GERDAU S.A.","prazoPagamento":"28 DDL","validade":"10 dias","tipoFrete":"CIF",` +
  `"itens":[${Array.from({ length: n }, (_, i) => item(i)).join(",")}]}\n</json>`;

/** A resposta cortada no meio de um item — é exatamente o que chega quando bate no teto. */
const truncado = (completos) =>
  `<json>\n{"fornecedor":"GERDAU S.A.","prazoPagamento":"28 DDL","validade":"10 dias","tipoFrete":"CIF",` +
  `"itens":[${Array.from({ length: completos }, (_, i) => item(i)).join(",")},` +
  `{"rmIndex":${completos},"descricao":"CANTONEIRA ABAS IGUAIS 2`;

describe("extrairJson", () => {
  it("pega o bloco entre as tags", () => {
    expect(JSON.parse(extrairJson(completo(2))).itens).toHaveLength(2);
  });

  it("funciona sem as tags, do primeiro { ao último }", () => {
    const cru = 'Claro! Segue:\n{"fornecedor":"X","itens":[]}\nEspero ter ajudado.';
    expect(JSON.parse(extrairJson(cru)).fornecedor).toBe("X");
  });
});

describe("recuperarJsonTruncado — 92 itens valem mais que zero", () => {
  // ⚠⚠ ERA ISTO QUE SE PERDIA. Numa proposta de cem linhas cortada no item 93, a rota devolvia
  // ZERO e o comprador digitava as cem à mão. O que falta na resposta não é dado: é um "]" e um "}".
  it("recupera os itens completos de uma resposta cortada no meio", () => {
    const r = recuperarJsonTruncado(truncado(92));
    expect(r.itens).toBe(92);
    expect(r.objeto.itens).toHaveLength(92);
    expect(r.objeto.fornecedor).toBe("GERDAU S.A.");
    expect(r.objeto.prazoPagamento).toBe("28 DDL");
  });

  // ⚠⚠ O ITEM PELA METADE É DESCARTADO INTEIRO. Completá-lo com null produziria uma linha com preço
  // e sem quantidade — e preço errado vira pedido de compra errado.
  it("descarta o item interrompido em vez de completar por conta própria", () => {
    const r = recuperarJsonTruncado(truncado(3));
    expect(r.itens).toBe(3);
    expect(r.objeto.itens.map((i) => i.rmIndex)).toEqual([0, 1, 2]);
    expect(r.objeto.itens.every((i) => i.precoUnit != null && i.qtd != null)).toBe(true);
  });

  // ⚠ Contar chave crua quebraria aqui: descrição de proposta é texto livre do fornecedor.
  it("não se perde com chave e aspas escapada dentro da descrição", () => {
    const s = `<json>{"fornecedor":"X","itens":[` +
      `{"rmIndex":0,"descricao":"DISCO 9\\" {promoção} corte","qtd":10,"precoUnit":5},` +
      `{"rmIndex":1,"descricao":"TUBO`;
    const r = recuperarJsonTruncado(s);
    expect(r.itens).toBe(1);
    expect(r.objeto.itens[0].descricao).toBe('DISCO 9" {promoção} corte');
  });

  it("resposta inteira também passa por aqui sem perder item", () => {
    expect(recuperarJsonTruncado(completo(5)).itens).toBe(5);
  });

  // ⚠ Cortada ANTES do primeiro item fechar não há o que recuperar — e inventar seria pior.
  it("devolve null quando nem um item fechou", () => {
    expect(recuperarJsonTruncado(`<json>{"fornecedor":"X","itens":[{"rmIndex":0,"desc`)).toBeNull();
    expect(recuperarJsonTruncado("desculpe, não consegui ler o documento")).toBeNull();
    expect(recuperarJsonTruncado("")).toBeNull();
  });
});

describe("motivoDaFalhaIA — mandar a pessoa para o lugar certo", () => {
  // ⚠⚠ "Provável ruído na extração" mandava reescanear um PDF que estava perfeito.
  it("corte por tamanho não é culpa do PDF, e a mensagem diz isso", () => {
    const m = motivoDaFalhaIA({ stopReason: "max_tokens", texto: "{..." });
    expect(m).toMatch(/grande/i);
    expect(m).not.toMatch(/ru[íi]do/i);
  });

  it("resposta vazia é outra coisa, e tem outra mensagem", () => {
    expect(motivoDaFalhaIA({ stopReason: "end_turn", texto: "   " })).toMatch(/não devolveu nada/i);
  });

  it("resposta com conteúdo que não é JSON sugere conferir o arquivo", () => {
    expect(motivoDaFalhaIA({ stopReason: "end_turn", texto: "Isto é um boleto." })).toMatch(/arquivo/i);
  });
});
