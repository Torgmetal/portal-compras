// ⚠⚠ Matheus (06/10/2026): "quando eu seleciono um item no portal de um fornecedor e outro de outro, o
// item movimenta de posição, vai lá pro fim da lista — precisa ficar fixo na sua posição". As linhas
// nasciam na ordem dos itens DA COTAÇÃO, que vêm do banco sem ORDER BY: marcar o vencedor atualiza a
// linha, o Postgres passa a devolvê-la por último, e a linha do mapa ia junto para o fim.
import { describe, it, expect } from "vitest";
import { buildMatriz } from "@/app/compras/painel-ops/[opId]/MapaCotacaoClient";

const rmItem = (id, ordem, descricao) => ({ id, ordem, descricao, unidade: "PC", qtd: 1, peso: 0, status: "COTADO" });
const ci = (id, rmItemId, preco, vencedor = false) => ({ id, rmItemId, precoUnit: preco, qtdCotada: 1, vencedor });

const montar = (itensC1, itensC2) => buildMatriz({
  id: "op107", numero: 107,
  rms: [{
    id: "rm6", numero: "T107-006-R00", categoriasOP: [],
    itens: [rmItem("i1", 0, "BARRA M12 150"), rmItem("i2", 1, "BARRA M12 180"), rmItem("i3", 2, "COLA")],
    cotacoes: [
      { id: "c1", rmId: "rm6", fornecedorNome: "R SIMIONI", status: "RECEBIDA", itens: itensC1 },
      { id: "c2", rmId: "rm6", fornecedorNome: "CASA DOS PARAFUSOS", status: "RECEBIDA", itens: itensC2 },
    ],
  }],
});

describe("mapa de cotação: a linha não sai do lugar", () => {
  it("o item marcado vencedor (que o banco devolve por último) continua na posição da RM", () => {
    // depois de marcar i1 vencedor na c1, o banco passou a devolvê-lo no fim
    const { itens } = montar([ci("a2", "i2", 5), ci("a3", "i3", 9), ci("a1", "i1", 3, true)], [ci("b3", "i3", 8, true), ci("b1", "i1", 4)]);
    expect(itens.map((i) => i.descricao)).toEqual(["BARRA M12 150", "BARRA M12 180", "COLA"]);
  });

  it("a ordem não depende de qual fornecedor aparece primeiro", () => {
    const a = montar([ci("a3", "i3", 9), ci("a1", "i1", 3)], [ci("b2", "i2", 5)]).itens.map((i) => i.rmItemId);
    const b = montar([ci("a1", "i1", 3), ci("a3", "i3", 9)], [ci("b2", "i2", 5)]).itens.map((i) => i.rmItemId);
    expect(a).toEqual(["i1", "i2", "i3"]);
    expect(b).toEqual(a);
  });
});
