// A RECUSA DO FORNECEDOR PRECISA APARECER NO MAPA — e não pode virar compra.
//
// ⚠⚠ Matheus (21/09/2026): "quando o fornecedor clicar em NÃO TENHO, o item deve aparecer na minha
// tela que ele respondeu NÃO TEM e não ficar apenas sem valor". O mapa só criava célula para item
// com preço, então a recusa sumia e virava o mesmo "—" de quem não respondeu — e o ramo que
// desenhava "s/ estoque" era CÓDIGO MORTO, inalcançável.
//
// ⚠ O risco do conserto é o oposto: célula de preço ZERO entrando em conta de dinheiro. Por isso
// os testes abaixo cobrem as duas metades — a recusa aparece, E ela não compra.
import { describe, it, expect } from "vitest";
import { buildMatriz } from "@/app/compras/painel-ops/[opId]/MapaCotacaoClient";
import { ofertaValida } from "@/lib/cotacao-indisponibilidade";

const rmItem = (id, descricao) => ({ id, descricao, unidade: "KG", qtd: 1, peso: 100, status: "COTADO" });

const montar = (itensCotacao) => buildMatriz({
  id: "op1", numero: 122,
  rms: [{
    id: "rm1", numero: "T122-002", categoriasOP: [],
    itens: [rmItem("i1", "CHAPA 6,30"), rmItem("i2", "CHAPA 19,00")],
    cotacoes: [{ id: "c1", rmId: "rm1", fornecedorNome: "FERALVAREZ", status: "RECEBIDA", itens: itensCotacao }],
  }],
});

describe("mapa comparativo: o fornecedor que diz NÃO TENHO", () => {
  it("vira célula, em vez de sumir da matriz", () => {
    const { itens } = montar([
      { id: "ci1", rmItemId: "i1", precoUnit: 0, qtdCotada: 100, semEstoque: true },
      { id: "ci2", rmItemId: "i2", precoUnit: 7.6, qtdCotada: 100, semEstoque: false },
    ]);
    const recusado = itens.find((i) => i.descricao === "CHAPA 6,30");
    expect(recusado.celulas).toHaveLength(1);
    expect(recusado.celulas[0].semEstoque).toBe(true);
  });

  // ⚠⚠ É ISTO que separa "respondeu" de "ofertou". A célula existe para ser LIDA; para dinheiro,
  // quem manda é `ofertaValida`.
  it("não é oferta comprável, mesmo existindo", () => {
    const { itens } = montar([
      { id: "ci1", rmItemId: "i1", precoUnit: 0, qtdCotada: 100, semEstoque: true },
      { id: "ci2", rmItemId: "i2", precoUnit: 7.6, qtdCotada: 100, semEstoque: false },
    ]);
    const recusada = itens.find((i) => i.descricao === "CHAPA 6,30").celulas[0];
    const ofertada = itens.find((i) => i.descricao === "CHAPA 19,00").celulas[0];
    expect(ofertaValida(recusada)).toBe(false);
    expect(ofertaValida(ofertada)).toBe(true);
  });

  // ⚠⚠ O VENCEDOR RESIDUAL (achado do Codex, 21/09/2026). A rota pública grava a indisponibilidade
  // por cima; se o item já era vencedor, a marca ficava. Um vencedor de preço ZERO somaria R$ 0,00
  // no total do fornecedor e sumiria da lista de "itens sem vencedor".
  it("item recusado que ficou marcado como vencedor não conta como oferta", () => {
    const { itens } = montar([
      { id: "ci1", rmItemId: "i1", precoUnit: 0, qtdCotada: 100, semEstoque: true, vencedor: true },
    ]);
    const cell = itens.find((i) => i.descricao === "CHAPA 6,30").celulas[0];
    expect(cell.vencedor).toBe(true);        // o estado sujo é preservado, não escondido
    expect(ofertaValida(cell)).toBe(false);  // mas não vira dinheiro
  });

  // ⚠ Item sem preço e SEM recusa continua fora: "não respondeu este item" não é resposta.
  it("item sem preço e sem recusa continua sem célula", () => {
    const { itens } = montar([
      { id: "ci1", rmItemId: "i1", precoUnit: 0, qtdCotada: 100, semEstoque: false },
      { id: "ci2", rmItemId: "i2", precoUnit: 7.6, qtdCotada: 100, semEstoque: false },
    ]);
    expect(itens.find((i) => i.descricao === "CHAPA 6,30").celulas).toHaveLength(0);
  });

  it("recusar TODOS os itens ainda registra o fornecedor na matriz", () => {
    const { fornecedores } = montar([
      { id: "ci1", rmItemId: "i1", precoUnit: 0, qtdCotada: 100, semEstoque: true },
      { id: "ci2", rmItemId: "i2", precoUnit: 0, qtdCotada: 100, semEstoque: true },
    ]);
    expect(fornecedores.map((f) => f.nome ?? f.fornecedorNome)).toContain("FERALVAREZ");
  });
});
